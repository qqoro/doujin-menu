import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Knex } from "knex";
import fs from "fs/promises";
import os from "os";
import path from "path";

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", getAppPath: () => "" },
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

import { shell } from "electron";

// console mock (main.ts에서 export)
vi.mock("../../../src/main/main.js", () => ({
  console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// configHandler mock (ElectronStore 초기화 방지)
vi.mock("../../../src/main/handlers/configHandler.js", () => ({
  store: { get: vi.fn() },
}));

// DB 모듈을 인메모리 DB로 교체 (getter 패턴)
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../../src/main/db/index.js", () => ({
  get default() {
    return dbRef.current!;
  },
}));

import {
  handleGetDuplicateGroups,
  handleDeleteDuplicateBooks,
} from "../../../src/main/handlers/duplicatesHandler.js";
import {
  createTestDb,
  truncateAll,
  seedBook,
} from "../../../src/main/db/test-utils.js";

// trashItem mock 참조 (permanent: true 경로 검증용)
const mockTrashItem = vi.mocked(shell.trashItem);

// 최상위 레벨에서 단일 DB 인스턴스 공유 (각 describe의 afterAll에서 destroy 방지)
let db: Knex;

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

beforeEach(async () => {
  await truncateAll(db);
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.destroy();
});

describe("handleGetDuplicateGroups", () => {
  it("제목이 같은 책 2권 → title 그룹 1개", async () => {
    // 같은 제목 2권 + 다른 제목 1권 시드
    await seedBook(db, { title: "중복 제목", path: "/lib/book-a" });
    await seedBook(db, { title: "중복 제목", path: "/lib/book-b" });
    await seedBook(db, { title: "고유 제목", path: "/lib/book-c" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("title");
    expect(result.groups![0].key).toBe("중복 제목");
    expect(result.groups![0].books).toHaveLength(2);
  });

  it("hitomi_id가 같은 책 → hitomi_id 그룹 (제목이 달라도)", async () => {
    // hitomi_id "12345"로 제목이 다른 2권 시드
    await seedBook(db, {
      title: "제목 A",
      path: "/lib/a",
      hitomi_id: "12345",
    });
    await seedBook(db, {
      title: "제목 B",
      path: "/lib/b",
      hitomi_id: "12345",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("hitomi_id");
    expect(result.groups![0].key).toBe("12345");
  });

  it("같은 묶음이 hitomi_id와 제목 양쪽에 걸리면 hitomi_id 그룹만 반환", async () => {
    // 같은 제목 + 같은 hitomi_id 2권 → hitomi_id 그룹만 반환 (title 그룹 중복 제거)
    await seedBook(db, {
      title: "동일 제목",
      path: "/lib/x",
      hitomi_id: "99999",
    });
    await seedBook(db, {
      title: "동일 제목",
      path: "/lib/y",
      hitomi_id: "99999",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("hitomi_id");
  });

  it("title 그룹에 hitomi_id 그룹 외 사본이 있으면 title 그룹도 유지", async () => {
    // 3권: 2권은 hitomi_id "777" 동일, 3권 모두 제목 동일
    await seedBook(db, {
      title: "공통 제목",
      path: "/lib/p1",
      hitomi_id: "777",
    });
    await seedBook(db, {
      title: "공통 제목",
      path: "/lib/p2",
      hitomi_id: "777",
    });
    await seedBook(db, {
      title: "공통 제목",
      path: "/lib/p3",
      hitomi_id: null,
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    // hitomi_id 그룹 1개 + title 그룹 1개(3권) = 2개
    expect(result.groups).toHaveLength(2);
    const hitomiGroup = result.groups!.find((g) => g.matchType === "hitomi_id");
    const titleGroup = result.groups!.find((g) => g.matchType === "title");
    expect(hitomiGroup).toBeDefined();
    expect(titleGroup).toBeDefined();
    expect(titleGroup!.books).toHaveLength(3);
  });

  it("isArchive는 경로 확장자(.zip/.cbz)로 판별", async () => {
    // 폴더 경로 1권 + CBZ 확장자 1권 (같은 제목)
    await seedBook(db, {
      title: "아카이브 테스트",
      path: "/lib/folder-book",
    });
    await seedBook(db, {
      title: "아카이브 테스트",
      path: "/lib/archive-zip-ver.CBZ",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    const books = result.groups![0].books;
    const folderBook = books.find((b) => b.path === "/lib/folder-book");
    const archiveBook = books.find(
      (b) => b.path === "/lib/archive-zip-ver.CBZ",
    );
    expect(folderBook!.isArchive).toBe(false);
    // 대소문자 무관 확인 (.CBZ → true)
    expect(archiveBook!.isArchive).toBe(true);
  });

  it("is_offline/is_favorite는 boolean으로 변환되어 반환", async () => {
    // is_offline: true 1권 + 일반 1권 (같은 제목)
    await seedBook(db, {
      title: "불리언 테스트",
      path: "/lib/offline-book",
      is_offline: true,
    });
    await seedBook(db, {
      title: "불리언 테스트",
      path: "/lib/online-book",
      is_offline: false,
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    const books = result.groups![0].books;
    const offlineBook = books.find((b) => b.path === "/lib/offline-book");
    const onlineBook = books.find((b) => b.path === "/lib/online-book");
    expect(offlineBook!.is_offline).toBe(true);
    expect(onlineBook!.is_offline).toBe(false);
    // is_offline의 타입이 boolean인지 확인 (숫자 1/0이 아님)
    expect(typeof offlineBook!.is_offline).toBe("boolean");
    expect(typeof onlineBook!.is_offline).toBe("boolean");
  });

  it("중복이 없으면 빈 배열", async () => {
    // 1권만 시드
    await seedBook(db, { title: "단독 책", path: "/lib/single" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });

  it("빈 제목('')은 중복 그룹으로 묶지 않음", async () => {
    // 메타데이터 불량으로 빈 제목이 2권 이상이어도 의미 없는 그룹 방지
    await seedBook(db, { title: "", path: "C:\\lib\\empty-a" });
    await seedBook(db, { title: "", path: "C:\\lib\\empty-b" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });
});

describe("handleDeleteDuplicateBooks", () => {
  it("온라인 책은 handleDeleteBook 경유로 삭제 (휴지통 기본)", async () => {
    // 존재하지 않는 파일 경로(ENOENT) → trashItem 호출 없이 DB 삭제
    const nonExistentPath = path.join(
      os.tmpdir(),
      "comiq-dup-test-not-exists.zip",
    );
    const book = await seedBook(db, {
      title: "삭제 대상 책",
      path: nonExistentPath,
      is_offline: false,
    });

    const result = await handleDeleteDuplicateBooks([book.id as number], false);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    // DB에서 사라졌는지 확인
    expect(await db("Book").where("id", book.id).first()).toBeUndefined();
  });

  it("오프라인 책은 삭제를 거부하고 errors에 집계 (이중 가드)", async () => {
    // 오프라인 1권 + 온라인 1권 전달
    const offlinePath = path.join(
      os.tmpdir(),
      "comiq-dup-offline-not-exists.zip",
    );
    const onlinePath = path.join(
      os.tmpdir(),
      "comiq-dup-online-not-exists.zip",
    );
    const offlineBook = await seedBook(db, {
      title: "오프라인 책",
      path: offlinePath,
      is_offline: true,
    });
    const onlineBook = await seedBook(db, {
      title: "온라인 책",
      path: onlinePath,
      is_offline: false,
    });

    const result = await handleDeleteDuplicateBooks(
      [offlineBook.id as number, onlineBook.id as number],
      false,
    );

    expect(result.success).toBe(false);
    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].bookId).toBe(offlineBook.id);
    // 오프라인 책 DB 레코드 보존 확인
    expect(await db("Book").where("id", offlineBook.id).first()).toBeDefined();
  });

  it("존재하지 않는 bookId는 errors에 집계", async () => {
    const result = await handleDeleteDuplicateBooks([99999], false);

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0].bookId).toBe(99999);
  });

  it("빈 bookIds 배열은 빈 결과로 성공 처리", async () => {
    const result = await handleDeleteDuplicateBooks([], false);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it("permanent: true가 handleDeleteBook에 전달되어 영구 삭제됨", async () => {
    // 실제 임시 파일을 만들어 permanent: true 경로 검증
    const filePath = path.join(os.tmpdir(), `comiq-dup-perm-${Date.now()}.zip`);
    await fs.writeFile(filePath, "dummy");
    const book = await seedBook(db, {
      title: "영구 전달 테스트",
      path: filePath,
    });

    const result = await handleDeleteDuplicateBooks([book.id as number], true);

    expect(result.success).toBe(true);
    // permanent: true이면 trashItem을 거치지 않고 직접 삭제
    expect(mockTrashItem).not.toHaveBeenCalled();
    // 파일이 실제로 삭제되었는지 확인
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
