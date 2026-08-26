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

vi.mock("../../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn(() => []) },
}));

// 태그 조회를 통째로 대체한다. 네트워크는 타지 않는다
const mockFetchTagIds = vi.fn();
vi.mock("../../../../src/main/services/subscription/nozomi.js", () => ({
  fetchTagIds: (...args: unknown[]) => mockFetchTagIds(...args),
  parseNozomiIds: vi.fn(),
}));

// 직접 조회가 실패하면 getGalleryIds로 폴백한다.
// 막아두지 않으면 실패 격리 테스트가 실제 네트워크를 탄다. getParsedTags는 진짜를 쓴다
vi.mock("node-hitomi", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = (actual.default ?? actual) as Record<string, unknown>;
  const mocked = {
    ...real,
    getGalleryIds: () => Promise.reject(new Error("네트워크 차단(테스트)")),
  };
  return { ...mocked, default: mocked };
});

const mockBroadcast = vi.fn();
const mockSendTo = vi.fn();
vi.mock("../../../../src/main/utils/broadcast.js", () => ({
  broadcast: (...args: unknown[]) => mockBroadcast(...args),
  sendTo: (...args: unknown[]) => mockSendTo(...args),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

const { createTestDb, truncateAll } =
  await import("../../../../src/main/db/test-utils.js");
const {
  runCycle,
  getStatus,
  getFeedSlice,
  markAllSeen,
  isFeedReady,
  setToastTarget,
  __resetSubscriptionState,
} =
  await import("../../../../src/main/services/subscription/subscriptionPoller.js");

let db: Knex;

/** 구독을 하나 넣고 id를 돌려준다 */
const addSubscription = async (
  query: string,
  overrides: Record<string, unknown> = {},
): Promise<number> => {
  const [id] = await db("Subscription").insert({
    query,
    normalized_query: query,
    enabled: true,
    ...overrides,
  });
  return id;
};

/** 태그 이름별로 ID 배열을 돌려주도록 스텁을 건다 */
const stubTags = (byName: Record<string, number[]>) => {
  mockFetchTagIds.mockImplementation((tag: { name: string }) =>
    Promise.resolve(byName[tag.name] ?? []),
  );
};

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

beforeEach(async () => {
  await truncateAll(db);
  vi.clearAllMocks();
  __resetSubscriptionState();
  setToastTarget({ id: 1 } as never);
});

afterAll(async () => {
  await db.destroy();
});

describe("runCycle — 기본 동작", () => {
  it("양성 태그 집합을 교집합해 피드를 만든다", async () => {
    await addSubscription("artist:foo language:korean", { last_seen_id: 0 });
    stubTags({ foo: [10, 20, 30], korean: [20, 30, 40] });

    await runCycle();

    const slice = getFeedSlice(0, 10);
    expect(slice.ids).toEqual([30, 20]);
    expect(slice.total).toBe(2);
  });

  it("여러 구독의 결과를 합치고 중복을 제거한다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    await addSubscription("artist:bar", { last_seen_id: 0 });
    stubTags({ foo: [1, 2], bar: [2, 3] });

    await runCycle();

    expect(getFeedSlice(0, 10).ids).toEqual([3, 2, 1]);
  });

  it("차단 태그를 결과에서 뺀다", async () => {
    const { store } =
      await import("../../../../src/main/handlers/configHandler.js");
    vi.mocked(store.get).mockReturnValue(["female:netorare"]);

    await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1, 2, 3], netorare: [2] });

    await runCycle();

    expect(getFeedSlice(0, 10).ids).toEqual([3, 1]);
    vi.mocked(store.get).mockReturnValue([]);
  });

  it("꺼진 구독은 폴링에서도 피드에서도 빠진다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    await addSubscription("artist:bar", { last_seen_id: 0, enabled: false });
    stubTags({ foo: [1], bar: [2] });

    await runCycle();

    expect(getFeedSlice(0, 10).ids).toEqual([1]);
  });

  it("피드를 다시 만들 때마다 generation이 올라간다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1] });

    await runCycle();
    const first = getFeedSlice(0, 1).generation;
    await runCycle();

    expect(getFeedSlice(0, 1).generation).toBeGreaterThan(first);
  });
});

describe("runCycle — 기준선", () => {
  it("last_seen_id가 null이면 기준선만 잡고 신작 0건", async () => {
    const id = await addSubscription("artist:foo");
    stubTags({ foo: [10, 20, 30] });

    await runCycle();

    expect(getStatus().newCount).toBe(0);
    const row = await db("Subscription").where("id", id).first();
    expect(row.last_seen_id).toBe(30);
  });

  it("기준선을 넘는 건수를 신작으로 센다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 15 });
    stubTags({ foo: [10, 20, 30] });

    await runCycle();

    expect(getStatus().newCount).toBe(2);
  });

  it("폴링은 last_seen_id를 올리지 않는다", async () => {
    const id = await addSubscription("artist:foo", { last_seen_id: 15 });
    stubTags({ foo: [10, 20, 30] });

    await runCycle();

    const row = await db("Subscription").where("id", id).first();
    expect(row.last_seen_id).toBe(15);
  });
});

describe("runCycle — 재진입 가드와 캐시", () => {
  it("진행 중이면 두 번째 사이클을 새로 시작하지 않는다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1] });

    await Promise.all([runCycle(), runCycle(), runCycle()]);

    // 세 번 불렀어도 태그 조회는 한 사이클 분량만 나간다
    expect(mockFetchTagIds).toHaveBeenCalledTimes(1);
  });

  it("같은 태그를 쓰는 구독이 여러 개여도 한 번만 조회한다", async () => {
    await addSubscription("artist:foo language:korean", { last_seen_id: 0 });
    await addSubscription("artist:bar language:korean", { last_seen_id: 0 });
    await addSubscription("artist:baz language:korean", { last_seen_id: 0 });
    stubTags({ foo: [1], bar: [2], baz: [3], korean: [1, 2, 3] });

    await runCycle();

    const koreanCalls = mockFetchTagIds.mock.calls.filter(
      ([tag]) => (tag as { name: string }).name === "korean",
    );
    expect(koreanCalls).toHaveLength(1);
  });
});

describe("runCycle — 실패 격리", () => {
  it("한 구독이 실패해도 나머지를 계속 처리한다", async () => {
    await addSubscription("artist:good1", { last_seen_id: 0 });
    await addSubscription("artist:bad", { last_seen_id: 0 });
    await addSubscription("artist:good2", { last_seen_id: 0 });

    mockFetchTagIds.mockImplementation((tag: { name: string }) => {
      if (tag.name === "bad") return Promise.reject(new Error("조회 실패"));
      if (tag.name === "good1") return Promise.resolve([1]);
      return Promise.resolve([2]);
    });

    await runCycle();

    expect(getFeedSlice(0, 10).ids).toEqual([2, 1]);
  });

  it("실패한 구독은 last_checked_at을 갱신하지 않는다", async () => {
    const id = await addSubscription("artist:bad", { last_seen_id: 0 });
    mockFetchTagIds.mockRejectedValue(new Error("조회 실패"));

    await runCycle();

    const row = await db("Subscription").where("id", id).first();
    expect(row.last_checked_at).toBeNull();
  });

  it("성공한 구독은 last_checked_at을 갱신한다", async () => {
    const id = await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1] });

    await runCycle();

    const row = await db("Subscription").where("id", id).first();
    expect(row.last_checked_at).toBeTruthy();
  });
});

describe("runCycle — last_seen_id 재읽기", () => {
  it("사이클 중간에 값이 올라가면 이후 구독이 새 값을 본다", async () => {
    // 읽음 처리가 사이클 도중에 끼어드는 상황을 재현한다.
    // 루프 시작 시 스냅샷을 잡으면 읽은 항목이 신작으로 되살아난다
    // 첫 구독은 신작이 나오지 않게 워터마크를 높여둔다.
    // 그래야 합계가 두 번째 구독의 판정만 반영한다
    await addSubscription("artist:aaa", { last_seen_id: 10 });
    const second = await addSubscription("artist:bbb", { last_seen_id: 0 });

    mockFetchTagIds.mockImplementation(async (tag: { name: string }) => {
      if (tag.name === "aaa") {
        // 첫 구독을 처리하는 동안 두 번째 구독의 워터마크가 올라간다
        await db("Subscription").where("id", second).update({
          last_seen_id: 100,
        });
        return [1];
      }
      return [50, 100];
    });

    await runCycle();

    // 갱신된 워터마크(100)로 판정하면 0건.
    // 루프 시작 시 스냅샷(0)을 썼다면 50과 100이 신작으로 잡혀 2건이 된다
    expect(getStatus().newCount).toBe(0);
  });
});

describe("토스트", () => {
  it("신작이 있으면 메인 창에만 보낸다 (broadcast 금지)", async () => {
    await addSubscription("artist:foo", { last_seen_id: 5 });
    stubTags({ foo: [10, 20] });

    await runCycle();

    expect(mockSendTo).toHaveBeenCalledWith(
      expect.anything(),
      "subscription-new-found",
      { subscriptionCount: 1, newCount: 2 },
    );
    expect(mockBroadcast).not.toHaveBeenCalledWith(
      "subscription-new-found",
      expect.anything(),
    );
  });

  it("같은 신작으로 두 번째 사이클에서는 발화하지 않는다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 5 });
    stubTags({ foo: [10, 20] });

    await runCycle();
    mockSendTo.mockClear();
    await runCycle();

    expect(mockSendTo).not.toHaveBeenCalled();
  });

  it("신작이 늘어나면 다시 발화한다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 5 });
    stubTags({ foo: [10, 20] });
    await runCycle();

    mockSendTo.mockClear();
    stubTags({ foo: [10, 20, 30] });
    await runCycle();

    expect(mockSendTo).toHaveBeenCalledWith(
      expect.anything(),
      "subscription-new-found",
      { subscriptionCount: 1, newCount: 3 },
    );
  });

  it("silent면 발화하지 않지만 알림 기준은 올려둔다", async () => {
    // 구독 추가·재활성화 직후에 쓰는 경로. 유저가 방금 한 행동이라 알리지 않는다
    await addSubscription("artist:foo", { last_seen_id: 5 });
    stubTags({ foo: [10, 20] });

    await runCycle({ silent: true });
    expect(mockSendTo).not.toHaveBeenCalled();

    // 다음 사이클도 건수가 같으므로 조용해야 한다
    await runCycle();
    expect(mockSendTo).not.toHaveBeenCalled();
  });

  it("신작이 없으면 발화하지 않는다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 100 });
    stubTags({ foo: [10, 20] });

    await runCycle();

    expect(mockSendTo).not.toHaveBeenCalled();
  });

  it("사이클이 끝나면 상태 갱신 신호를 브로드캐스트한다", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1] });

    await runCycle();

    expect(mockBroadcast).toHaveBeenCalledWith("subscriptions-updated");
  });
});

describe("markAllSeen", () => {
  it("모든 구독의 워터마크를 각자 최대 ID로 올린다", async () => {
    const first = await addSubscription("artist:foo", { last_seen_id: 5 });
    const second = await addSubscription("artist:bar", { last_seen_id: 1 });
    stubTags({ foo: [10, 20], bar: [7] });
    await runCycle();

    await markAllSeen();

    expect(
      (await db("Subscription").where("id", first).first()).last_seen_id,
    ).toBe(20);
    expect(
      (await db("Subscription").where("id", second).first()).last_seen_id,
    ).toBe(7);
    expect(getStatus().newCount).toBe(0);
  });

  it("아직 폴링되지 않은 구독은 건드리지 않는다", async () => {
    const id = await addSubscription("artist:foo", { last_seen_id: 5 });

    await markAllSeen();

    expect(
      (await db("Subscription").where("id", id).first()).last_seen_id,
    ).toBe(5);
  });
});

describe("isFeedReady", () => {
  it("첫 사이클 전에는 false", () => {
    expect(isFeedReady()).toBe(false);
  });

  it("사이클을 한 번 돌면 true", async () => {
    await addSubscription("artist:foo", { last_seen_id: 0 });
    stubTags({ foo: [1] });

    await runCycle();

    expect(isFeedReady()).toBe(true);
  });
});
