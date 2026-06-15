import { ipcMain } from "electron";
import type { DuplicateBookInfo, DuplicateGroup } from "../../types/ipc.js";
import db from "../db/index.js";
import { console } from "../main.js";
import { handleDeleteBook } from "./bookHandler.js";

// 경로 확장자로 압축파일 여부 판별 (Book.type은 장르 메타데이터이므로 사용 불가)
const isArchivePath = (p: string) => /\.(zip|cbz)$/i.test(p);

// 중복 그룹 조회 시 사용하는 Book 컬럼
const BOOK_COLUMNS = [
  "id",
  "title",
  "path",
  "page_count",
  "cover_path",
  "is_offline",
  "is_favorite",
  "current_page",
  "last_read_at",
  "hitomi_id",
];

interface BookRow {
  id: number;
  title: string;
  path: string;
  page_count: number | null;
  cover_path: string | null;
  is_offline: number | boolean;
  is_favorite: number | boolean;
  current_page: number | null;
  last_read_at: string | null;
  hitomi_id: string | null;
}

// DB 행을 응답용 사본 정보로 변환 (SQLite의 0/1을 boolean으로)
const toBookInfo = (row: BookRow): DuplicateBookInfo => ({
  id: row.id,
  title: row.title,
  path: row.path,
  isArchive: isArchivePath(row.path),
  page_count: row.page_count,
  cover_path: row.cover_path,
  is_offline: Boolean(row.is_offline),
  is_favorite: Boolean(row.is_favorite),
  current_page: row.current_page,
  last_read_at: row.last_read_at,
});

export const handleGetDuplicateGroups = async () => {
  try {
    const groups: DuplicateGroup[] = [];
    // hitomi_id 그룹에 포함된 book id 집합 (title 그룹 교차 중복 제거용)
    const hitomiGroupedIds = new Set<number>();

    // 1) hitomi_id 기준 중복 그룹 — 서브쿼리 1회로 중복 키와 행을 함께 가져옴
    const hitomiRows: BookRow[] = await db("Book")
      .select(BOOK_COLUMNS)
      .whereIn(
        "hitomi_id",
        db("Book")
          .select("hitomi_id")
          .whereNotNull("hitomi_id")
          .groupBy("hitomi_id")
          .having(db.raw("count(*) > 1")),
      )
      .orderBy("id");

    if (hitomiRows.length > 0) {
      const byHitomiId = new Map<string, BookRow[]>();
      for (const row of hitomiRows) {
        const key = String(row.hitomi_id);
        if (!byHitomiId.has(key)) byHitomiId.set(key, []);
        byHitomiId.get(key)!.push(row);
        hitomiGroupedIds.add(row.id);
      }
      for (const [key, books] of byHitomiId) {
        groups.push({
          key,
          matchType: "hitomi_id",
          books: books.map(toBookInfo),
        });
      }
    }

    // 2) 제목 기준 중복 그룹 — 서브쿼리 1회, 빈 제목은 제외
    const titleRows: BookRow[] = await db("Book")
      .select(BOOK_COLUMNS)
      .whereIn(
        "title",
        db("Book")
          .select("title")
          .where("title", "!=", "")
          .groupBy("title")
          .having(db.raw("count(*) > 1")),
      )
      .orderBy("id");

    if (titleRows.length > 0) {
      const byTitle = new Map<string, BookRow[]>();
      for (const row of titleRows) {
        if (!byTitle.has(row.title)) byTitle.set(row.title, []);
        byTitle.get(row.title)!.push(row);
      }
      for (const [key, books] of byTitle) {
        // 모든 사본이 이미 hitomi_id 그룹에 포함되면 같은 묶음이므로 title 그룹 제외 (교차 중복 제거)
        if (books.every((b) => hitomiGroupedIds.has(b.id))) continue;
        groups.push({ key, matchType: "title", books: books.map(toBookInfo) });
      }
    }

    return { success: true, groups };
  } catch (error) {
    console.error("[Main] 중복 그룹 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message || "알 수 없는 오류",
    };
  }
};

export const handleDeleteDuplicateBooks = async (
  bookIds: number[],
  permanent: boolean,
) => {
  const errors: { bookId: number; error: string }[] = [];
  let deletedCount = 0;

  for (const bookId of bookIds) {
    try {
      const book = await db("Book").where("id", bookId).first();
      if (!book) {
        errors.push({ bookId, error: "책을 찾을 수 없습니다." });
        continue;
      }
      // 오프라인 책은 파일 접근이 불가하므로 삭제 거부 (UI 비활성과 별개의 이중 가드)
      if (book.is_offline) {
        errors.push({
          bookId,
          error: "오프라인 상태의 책은 삭제할 수 없습니다.",
        });
        continue;
      }

      const result = await handleDeleteBook(bookId, { permanent });
      if (result.success) {
        deletedCount++;
      } else {
        errors.push({ bookId, error: result.error ?? "알 수 없는 오류" });
      }
    } catch (error) {
      errors.push({ bookId, error: (error as Error).message });
    }
  }

  return {
    success: errors.length === 0,
    deletedCount,
    failedCount: errors.length,
    errors,
  };
};

export function registerDuplicatesHandlers() {
  ipcMain.handle("get-duplicate-groups", () => handleGetDuplicateGroups());
  ipcMain.handle(
    "delete-duplicate-books",
    (_event, params: { bookIds: number[]; permanent: boolean }) =>
      handleDeleteDuplicateBooks(params.bookIds, params.permanent),
  );
}
