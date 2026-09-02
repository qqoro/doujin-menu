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
  seedArtist,
  seedBook,
  seedTag,
} from "../../../src/main/db/test-utils.js";
import { store as configStore } from "../../../src/main/handlers/configHandler.js";

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
  // clearAllMocks는 구현을 안 지운다. 설정 목이 다음 테스트로 새면 제목 표기가 달라진다
  vi.mocked(configStore.get).mockReset();
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

  it("표기만 다른 제목은 title_normalized 그룹으로 묶는다", async () => {
    // 무수정판 꼬리표만 붙은 같은 작품 — 완전 일치로는 안 잡힌다
    await seedBook(db, { title: "배수진", path: "/lib/n1" });
    await seedBook(db, { title: "배수진 (decensored)", path: "/lib/n2" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("title_normalized");
    expect(result.groups![0].books).toHaveLength(2);
  });

  it("권차가 다른 사본은 정규화해도 묶지 않는다", async () => {
    await seedBook(db, { title: "임신 이야기 (2)", path: "/lib/v2" });
    await seedBook(db, { title: "임신 이야기 (3)", path: "/lib/v3" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });

  it("완전 일치로 이미 잡힌 묶음을 title_normalized로 또 내지 않는다", async () => {
    await seedBook(db, { title: "같은 제목", path: "/lib/s1" });
    await seedBook(db, { title: "같은 제목", path: "/lib/s2" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("title");
  });

  it("완전 일치 그룹에 표기가 다른 사본이 더 붙으면 정규화 그룹도 함께 낸다", async () => {
    // 구성이 다른 그룹이므로 서명이 달라 둘 다 살아남는다
    await seedBook(db, { title: "공통 작품", path: "/lib/m1" });
    await seedBook(db, { title: "공통 작품", path: "/lib/m2" });
    await seedBook(db, { title: "공통 작품 (decensored)", path: "/lib/m3" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    const normalized = result.groups!.find(
      (group) => group.matchType === "title_normalized",
    );
    expect(result.groups!.some((group) => group.matchType === "title")).toBe(
      true,
    );
    expect(normalized?.books).toHaveLength(3);
  });

  it("괄호를 걷으면 알맹이가 없는 제목끼리는 묶지 않는다", async () => {
    // 이모지만 남는 제목이 꼬리표를 공유한다는 이유로 뭉치는 오탐 방지
    await seedBook(db, { title: "🐺 (decensored)", path: "/lib/e1" });
    await seedBook(db, { title: "🎃 (decensored)", path: "/lib/e2" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });

  it("정규화 그룹의 사본에도 작가·태그가 실린다", async () => {
    // 정규화 그룹은 뒤늦게 행을 채우는 경로를 타므로 관계 조회가 빠지기 쉽다
    const bookA = await seedBook(db, { title: "관계 확인", path: "/lib/nr-a" });
    const bookB = await seedBook(db, {
      title: "관계 확인 (decensored)",
      path: "/lib/nr-b",
    });
    const artist = await seedArtist(db, "작가N");
    const tag = await seedTag(db, "태그N");
    await db("BookArtist").insert([
      { book_id: bookA.id, artist_id: artist.id },
      { book_id: bookB.id, artist_id: artist.id },
    ]);
    await db("BookTag").insert({ book_id: bookB.id, tag_id: tag.id });

    const result = await handleGetDuplicateGroups();
    const group = result.groups!.find(
      (g) => g.matchType === "title_normalized",
    )!;

    expect(group.books).toHaveLength(2);
    expect(group.books.every((b) => b.artists?.length === 1)).toBe(true);
    expect(group.books.find((b) => b.path === "/lib/nr-b")!.tags).toEqual([
      { name: "태그N" },
    ]);
  });

  it("정규화 그룹이 hitomi_id 그룹보다 넓으면 둘 다 낸다", async () => {
    await seedBook(db, { title: "작품", path: "/lib/w1", hitomi_id: "555" });
    await seedBook(db, { title: "작품", path: "/lib/w2", hitomi_id: "555" });
    await seedBook(db, { title: "작품 (decensored)", path: "/lib/w3" });

    const result = await handleGetDuplicateGroups();

    const hitomi = result.groups!.find((g) => g.matchType === "hitomi_id");
    const normalized = result.groups!.find(
      (g) => g.matchType === "title_normalized",
    );
    expect(hitomi?.books).toHaveLength(2);
    expect(normalized?.books).toHaveLength(3);
    // 완전 일치 그룹은 hitomi_id 그룹과 구성이 같아 빠진다
    expect(result.groups!.some((g) => g.matchType === "title")).toBe(false);
  });

  it("정규화 그룹의 오프라인 사본도 boolean 변환과 용량 생략이 유지된다", async () => {
    await seedBook(db, {
      title: "오프라인 확인",
      path: "C:\\없는경로\\a",
      is_offline: true,
    });
    await seedBook(db, {
      title: "오프라인 확인 (decensored)",
      path: "C:\\없는경로\\b",
      is_offline: true,
    });

    const result = await handleGetDuplicateGroups();
    const group = result.groups!.find(
      (g) => g.matchType === "title_normalized",
    )!;

    expect(group.books).toHaveLength(2);
    expect(group.books.every((b) => b.is_offline === true)).toBe(true);
    expect(group.books.every((b) => b.file_size === null)).toBe(true);
  });

  it("표지 해시가 가까우면 cover_hash 그룹으로 묶는다", async () => {
    await seedBook(db, {
      title: "표지 확인 A",
      path: "/lib/ch-a",
      cover_hash: "0f0f0f0f0f0f0f0f",
    });
    await seedBook(db, {
      title: "전혀 다른 제목 B",
      path: "/lib/ch-b",
      cover_hash: "0f0f0f0f0f0f0f0e",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("cover_hash");
    expect(result.groups![0].books).toHaveLength(2);
  });

  it("표지 해시가 멀면 묶지 않는다", async () => {
    await seedBook(db, {
      title: "표지 확인 C",
      path: "/lib/ch-c",
      cover_hash: "0f0f0f0f0f0f0f0f",
    });
    await seedBook(db, {
      title: "표지 확인 D",
      path: "/lib/ch-d",
      cover_hash: "f0f0f0f0f0f0f0f0",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });

  it("cover_hash가 없는 책은 그룹핑에서 뺀다", async () => {
    await seedBook(db, { title: "해시 없음 A", path: "/lib/nh-a" });
    await seedBook(db, { title: "해시 없음 B", path: "/lib/nh-b" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
  });

  it("이미 다른 근거로 나온 그룹과 구성이 같으면 표지 그룹을 또 내지 않는다", async () => {
    await seedBook(db, {
      title: "같은 제목",
      path: "/lib/dup-1",
      cover_hash: "0f0f0f0f0f0f0f0f",
    });
    await seedBook(db, {
      title: "같은 제목",
      path: "/lib/dup-2",
      cover_hash: "0f0f0f0f0f0f0f0f",
    });

    const result = await handleGetDuplicateGroups();

    expect(result.groups).toHaveLength(1);
    expect(result.groups![0].matchType).toBe("title");
  });

  it("표지 그룹의 오프라인 사본도 boolean 변환과 용량 생략이 유지된다", async () => {
    await seedBook(db, {
      title: "오프라인 표지 A",
      path: "C:\\없는경로\\ch-a",
      is_offline: true,
      cover_hash: "3c3c3c3c3c3c3c3c",
    });
    await seedBook(db, {
      title: "오프라인 표지 B",
      path: "C:\\없는경로\\ch-b",
      is_offline: true,
      cover_hash: "3c3c3c3c3c3c3c3d",
    });

    const result = await handleGetDuplicateGroups();
    const group = result.groups!.find((g) => g.matchType === "cover_hash")!;

    expect(group.books).toHaveLength(2);
    expect(group.books.every((b) => b.is_offline === true)).toBe(true);
    expect(group.books.every((b) => b.file_size === null)).toBe(true);
  });

  it("작가·태그가 함께 실린다 (제목만 같고 작가가 다르면 오탐 판별 근거)", async () => {
    const bookA = await seedBook(db, {
      title: "관계 테스트",
      path: "/lib/rel-a",
    });
    const bookB = await seedBook(db, {
      title: "관계 테스트",
      path: "/lib/rel-b",
    });
    const artistA = await seedArtist(db, "작가A");
    const artistB = await seedArtist(db, "작가B");
    const tag = await seedTag(db, "태그1");
    await db("BookArtist").insert([
      { book_id: bookA.id, artist_id: artistA.id },
      { book_id: bookB.id, artist_id: artistB.id },
    ]);
    await db("BookTag").insert({ book_id: bookA.id, tag_id: tag.id });

    const result = await handleGetDuplicateGroups();
    const books = result.groups![0].books;

    expect(books.find((b) => b.path === "/lib/rel-a")!.artists).toEqual([
      { name: "작가A" },
    ]);
    expect(books.find((b) => b.path === "/lib/rel-b")!.artists).toEqual([
      { name: "작가B" },
    ]);
    expect(books.find((b) => b.path === "/lib/rel-a")!.tags).toEqual([
      { name: "태그1" },
    ]);
  });

  it("prioritizeKoreanTitles가 켜지면 라이브러리와 같은 제목 표기를 쓴다", async () => {
    vi.mocked(configStore.get).mockImplementation((key: string) =>
      key === "prioritizeKoreanTitles" ? true : undefined,
    );
    await seedBook(db, { title: "English | 한글제목", path: "/lib/ko-a" });
    await seedBook(db, { title: "English | 한글제목", path: "/lib/ko-b" });

    const result = await handleGetDuplicateGroups();

    // 그룹 키는 DB 원본, 표시용 제목만 치환된다
    expect(result.groups![0].key).toBe("English | 한글제목");
    expect(result.groups![0].books[0].title).toBe("한글제목");
  });

  it("압축파일은 DB의 file_size를 그대로 싣는다", async () => {
    await seedBook(db, {
      title: "용량 테스트",
      path: "/lib/sized-a.zip",
      file_size: 1024,
    });
    await seedBook(db, {
      title: "용량 테스트",
      path: "/lib/sized-b.zip",
      file_size: 2048,
    });

    const result = await handleGetDuplicateGroups();
    const books = result.groups![0].books;

    expect(books.find((b) => b.path === "/lib/sized-a.zip")!.file_size).toBe(
      1024,
    );
    expect(books.find((b) => b.path === "/lib/sized-b.zip")!.file_size).toBe(
      2048,
    );
  });

  it("폴더는 DB에 용량이 없으므로 조회 시점에 합산한다", async () => {
    // 스캔은 ZIP/CBZ에만 file_size를 남긴다. 폴더는 여기서 직접 재야 값이 생긴다
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dup-folder-"));
    const folderA = path.join(tmp, "a");
    const folderB = path.join(tmp, "b");
    await fs.mkdir(folderA);
    await fs.mkdir(folderB);
    await fs.writeFile(path.join(folderA, "1.jpg"), Buffer.alloc(300));
    await fs.writeFile(path.join(folderA, "2.jpg"), Buffer.alloc(200));
    await fs.writeFile(path.join(folderB, "1.jpg"), Buffer.alloc(100));

    await seedBook(db, { title: "폴더 용량", path: folderA });
    await seedBook(db, { title: "폴더 용량", path: folderB });

    const result = await handleGetDuplicateGroups();
    const books = result.groups![0].books;

    expect(books.find((b) => b.path === folderA)!.file_size).toBe(500);
    expect(books.find((b) => b.path === folderB)!.file_size).toBe(100);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("접근할 수 없는 폴더는 용량이 null이고 조회는 계속된다", async () => {
    await seedBook(db, { title: "없는 폴더", path: "/lib/does-not-exist-a" });
    await seedBook(db, { title: "없는 폴더", path: "/lib/does-not-exist-b" });

    const result = await handleGetDuplicateGroups();

    expect(result.success).toBe(true);
    expect(result.groups![0].books.every((b) => b.file_size === null)).toBe(
      true,
    );
  });

  it("오프라인 책은 용량을 재려 하지 않는다 (경로 접근 불가가 확정)", async () => {
    await seedBook(db, {
      title: "오프라인 용량",
      path: "/lib/offline-size-a",
      is_offline: true,
    });
    await seedBook(db, {
      title: "오프라인 용량",
      path: "/lib/offline-size-b",
      is_offline: true,
    });

    const result = await handleGetDuplicateGroups();

    expect(result.groups![0].books.every((b) => b.file_size === null)).toBe(
      true,
    );
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
