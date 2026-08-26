import type { Knex } from "knex";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

// console은 main.ts에서 export된다. 목킹하지 않으면 main.ts가 통째로 로드되어
// electron-updater가 app.getVersion()을 찾다가 죽는다
vi.mock("../../../../src/main/main.js", () => ({
  console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn(() => []) },
}));

const mockFetchTagIds = vi.fn();
vi.mock("../../../../src/main/services/subscription/nozomi.js", () => ({
  fetchTagIds: (...args: unknown[]) => mockFetchTagIds(...args),
  parseNozomiIds: vi.fn(),
}));

// 직접 조회가 실패하면 폴러가 getGalleryIds로 폴백한다.
// 막아두지 않으면 유닛 테스트가 실제 네트워크를 탄다. getParsedTags는 진짜를 쓴다
vi.mock("node-hitomi", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = (actual.default ?? actual) as Record<string, unknown>;
  const mocked = {
    ...real,
    getGalleryIds: () => Promise.reject(new Error("네트워크 차단(테스트)")),
  };
  return { ...mocked, default: mocked };
});

vi.mock("../../../../src/main/utils/broadcast.js", () => ({
  broadcast: vi.fn(),
  sendTo: vi.fn(),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

const { createTestDb, truncateAll } =
  await import("../../../../src/main/db/test-utils.js");
const { __resetSubscriptionState, getStatus } =
  await import("../../../../src/main/services/subscription/subscriptionPoller.js");
const {
  handleAddSubscription,
  handleGetSubscriptions,
  handleUpdateSubscription,
  handleRemoveSubscription,
  handleGetSubscriptionFeed,
  handleGetSubscriptionStatus,
  handleEnterSubscriptionTab,
} = await import("../../../../src/main/handlers/subscriptionHandler.js");

let db: Knex;

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

beforeEach(async () => {
  await truncateAll(db);
  vi.clearAllMocks();
  __resetSubscriptionState();
  mockFetchTagIds.mockResolvedValue([10, 20, 30]);
});

afterAll(async () => {
  await db.destroy();
});

describe("handleAddSubscription", () => {
  it("양성 태그가 있으면 등록된다", async () => {
    const result = await handleAddSubscription({ query: "artist:foo" });

    expect(result.success).toBe(true);
    expect(result.data?.query).toBe("artist:foo");
  });

  it("제목 단어만 있으면 한국어 사유로 거부한다", async () => {
    const result = await handleAddSubscription({ query: "제목단어" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[가-힣]/);
  });

  it("등록 시 현재 최대 ID를 기준선으로 잡는다", async () => {
    const result = await handleAddSubscription({ query: "artist:foo" });

    const row = await db("Subscription").where("id", result.data!.id).first();
    expect(row.last_seen_id).toBe(30);
  });

  it("기준선을 잡았으므로 방금 추가한 구독은 신작 0건이다", async () => {
    await handleAddSubscription({ query: "artist:foo" });

    expect(getStatus().newCount).toBe(0);
  });

  it("조회에 실패해도 등록은 성공하고 기준선은 비워둔다", async () => {
    mockFetchTagIds.mockRejectedValue(new Error("오프라인"));

    const result = await handleAddSubscription({ query: "artist:foo" });

    expect(result.success).toBe(true);
    const row = await db("Subscription").where("id", result.data!.id).first();
    expect(row.last_seen_id).toBeNull();
  });

  it("태그 순서만 다른 중복은 한국어 메시지로 막는다", async () => {
    await handleAddSubscription({ query: "artist:a tag:b" });

    const result = await handleAddSubscription({ query: "tag:b artist:a" });

    expect(result.success).toBe(false);
    // SQLite 원문(UNIQUE constraint failed...)이 그대로 새어나오면 안 된다
    expect(result.error).not.toMatch(/UNIQUE|constraint/i);
    expect(result.error).toMatch(/[가-힣]/);
  });

  it("label을 지정할 수 있다", async () => {
    const result = await handleAddSubscription({
      query: "artist:foo",
      label: "좋아하는 작가",
    });

    expect(result.data?.label).toBe("좋아하는 작가");
  });
});

describe("handleGetSubscriptions", () => {
  it("등록한 구독을 돌려준다", async () => {
    await handleAddSubscription({ query: "artist:foo" });
    await handleAddSubscription({ query: "artist:bar" });

    const result = await handleGetSubscriptions();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it("enabled를 boolean으로 변환해서 준다", async () => {
    await handleAddSubscription({ query: "artist:foo" });

    const result = await handleGetSubscriptions();

    expect(result.data![0].enabled).toBe(true);
  });
});

describe("handleUpdateSubscription", () => {
  it("이름을 바꾼다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    await handleUpdateSubscription({ id: added.data!.id, label: "새 이름" });

    const row = await db("Subscription").where("id", added.data!.id).first();
    expect(row.label).toBe("새 이름");
  });

  it("껐다 켜면 그동안의 작품이 신작으로 잡히되 토스트 기준은 미리 올라간다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });
    await handleUpdateSubscription({ id: added.data!.id, enabled: false });

    // 꺼져 있는 동안 새 작품이 올라왔다
    mockFetchTagIds.mockResolvedValue([10, 20, 30, 40, 50]);
    await handleUpdateSubscription({ id: added.data!.id, enabled: true });

    // 신작으로는 잡힌다 (빨간 점은 켜진다)
    expect(getStatus().newCount).toBe(2);
  });

  it("끄면 피드에서 빠진다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    await handleUpdateSubscription({ id: added.data!.id, enabled: false });

    const feed = await handleGetSubscriptionFeed({ start: 0, count: 10 });
    expect(feed.total).toBe(0);
  });

  it("검색어를 바꾸면 정규화 키까지 같이 바뀐다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    const result = await handleUpdateSubscription({
      id: added.data!.id,
      query: "artist:bar female:sole_female",
    });

    expect(result.success).toBe(true);
    const row = await db("Subscription").where("id", added.data!.id).first();
    expect(row.query).toBe("artist:bar female:sole_female");
    expect(row.normalized_query).toBe("artist:bar female:sole_female");
  });

  it("검색어를 바꿔도 기준선은 그대로 남는다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });
    const before = await db("Subscription").where("id", added.data!.id).first();
    expect(before.last_seen_id).not.toBeNull();

    await handleUpdateSubscription({ id: added.data!.id, query: "artist:bar" });

    const after = await db("Subscription").where("id", added.data!.id).first();
    expect(after.last_seen_id).toBe(before.last_seen_id);
  });

  it("기준선이 남으므로 바꾼 검색어의 그 뒤 작품이 신작으로 잡힌다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    // 기준선(30) 위아래로 걸치는 결과를 주면 위쪽만 신작이어야 한다
    mockFetchTagIds.mockResolvedValue([10, 20, 30, 40, 50]);
    await handleUpdateSubscription({ id: added.data!.id, query: "artist:bar" });

    expect(getStatus().newCount).toBe(2);
  });

  it("태그가 없는 검색어로는 못 바꾸고 원래 값이 남는다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    const result = await handleUpdateSubscription({
      id: added.data!.id,
      query: "제목단어만",
    });

    expect(result.success).toBe(false);
    const row = await db("Subscription").where("id", added.data!.id).first();
    expect(row.query).toBe("artist:foo");
  });

  it("다른 구독과 같은 검색어로는 못 바꾼다", async () => {
    const first = await handleAddSubscription({ query: "artist:foo" });
    await handleAddSubscription({ query: "artist:bar" });

    const result = await handleUpdateSubscription({
      id: first.data!.id,
      query: "artist:bar",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("이미 같은 검색어");
  });

  it("검색어를 그대로 둔 저장은 자기 자신과의 중복으로 막히지 않는다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    const result = await handleUpdateSubscription({
      id: added.data!.id,
      query: "artist:foo",
      label: "새 이름",
    });

    expect(result.success).toBe(true);
    const row = await db("Subscription").where("id", added.data!.id).first();
    expect(row.label).toBe("새 이름");
  });
});

describe("handleRemoveSubscription", () => {
  it("삭제하면 피드에서 즉시 빠진다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });

    await handleRemoveSubscription(added.data!.id);

    const feed = await handleGetSubscriptionFeed({ start: 0, count: 10 });
    expect(feed.total).toBe(0);
    expect(await db("Subscription").count("* as c").first()).toMatchObject({
      c: 0,
    });
  });
});

describe("handleGetSubscriptionFeed", () => {
  it("search-galleries와 같은 모양으로 돌려준다", async () => {
    await handleAddSubscription({ query: "artist:foo" });

    const result = await handleGetSubscriptionFeed({ start: 0, count: 2 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([30, 20]);
    expect(result.total).toBe(3);
    expect(typeof result.generation).toBe("number");
  });

  it("구간을 잘라준다", async () => {
    await handleAddSubscription({ query: "artist:foo" });

    const result = await handleGetSubscriptionFeed({ start: 1, count: 2 });

    expect(result.data).toEqual([20, 10]);
  });

  it("피드가 아직 없으면 그 자리에서 한 사이클 돌린다", async () => {
    // 앱 시작 직후 첫 폴링 전에 구독 탭을 여는 경우
    await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
      last_seen_id: 0,
    });

    const result = await handleGetSubscriptionFeed({ start: 0, count: 10 });

    expect(result.total).toBe(3);
  });
});

describe("handleEnterSubscriptionTab", () => {
  it("모든 구독을 읽음 처리한다", async () => {
    const added = await handleAddSubscription({ query: "artist:foo" });
    await db("Subscription")
      .where("id", added.data!.id)
      .update({ last_seen_id: 5 });
    await handleGetSubscriptionFeed({ start: 0, count: 10 });

    await handleEnterSubscriptionTab();

    const row = await db("Subscription").where("id", added.data!.id).first();
    expect(row.last_seen_id).toBe(30);
  });

  it("읽음 처리 후 신작 건수가 0이 된다", async () => {
    await db("Subscription").insert({
      query: "artist:foo",
      normalized_query: "artist:foo",
      last_seen_id: 5,
    });
    await handleGetSubscriptionFeed({ start: 0, count: 10 });
    expect(getStatus().newCount).toBe(3);

    await handleEnterSubscriptionTab();

    expect(getStatus().newCount).toBe(0);
  });
});

describe("handleGetSubscriptionStatus", () => {
  it("요약을 돌려준다", async () => {
    await handleAddSubscription({ query: "artist:foo" });

    const result = await handleGetSubscriptionStatus();

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ subscriptionCount: 1, feedTotal: 3 });
  });
});
