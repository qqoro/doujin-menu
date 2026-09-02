import { ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import type { DuplicateBookInfo, DuplicateGroup } from "../../types/ipc.js";
import db from "../db/index.js";
import { console } from "../main.js";
import { normalizeTitleKey } from "../services/duplicateDetection/titleKey.js";
import { handleDeleteBook, mapBooksToResponse } from "./bookHandler.js";

// 경로 확장자로 압축파일 여부 판별 (Book.type은 장르 메타데이터이므로 사용 불가)
const isArchivePath = (p: string) => /\.(zip|cbz)$/i.test(p);

/** 구성이 똑같은 그룹을 두 번 보여주지 않으려고 쓰는 비교용 서명 */
const groupSignature = (ids: number[]) =>
  [...ids].sort((a, b) => a - b).join(",");

interface BookRow {
  id: number;
  title: string;
  path: string;
  is_offline: number | boolean;
  file_size: number | null;
  file_mtime: number | null;
  [key: string]: unknown;
}

/**
 * 폴더 책의 용량을 합산한다.
 *
 * 스캔은 ZIP/CBZ에만 `file_size`를 남긴다(폴더 크기는 재스캔 판단에 못 쓴다).
 * 중복 그룹에 뜬 폴더는 수십 개 규모라 조회 시점에 직접 재도 부담이 없다.
 * 책 폴더는 이미지가 평면으로 놓인 구조라 하위 폴더는 훑지 않는다.
 */
const calcFolderSize = async (dirPath: string): Promise<number | null> => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          try {
            return (await fs.stat(path.join(dirPath, entry.name))).size;
          } catch {
            return 0;
          }
        }),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return null;
  }
};

/**
 * 사본 정보를 완성한다. 라이브러리와 같은 매퍼를 거치므로 제목 표기
 * (`prioritizeKoreanTitles`)와 작가·태그가 라이브러리 화면과 일치한다.
 */
const toBookInfos = async (rows: BookRow[]): Promise<DuplicateBookInfo[]> => {
  const mapped = await mapBooksToResponse(rows);

  return Promise.all(
    mapped.map(async (row) => {
      const isArchive = isArchivePath(row.path);
      // 오프라인은 경로 접근이 안 되는 게 확정이라 재는 시도 자체를 건너뛴다
      const needsMeasure =
        !isArchive && row.file_size == null && !row.is_offline;

      return {
        ...row,
        isArchive,
        file_size: needsMeasure
          ? await calcFolderSize(row.path)
          : (row.file_size ?? null),
        file_mtime: row.file_mtime ?? null,
        // SQLite의 0/1을 boolean으로
        is_offline: Boolean(row.is_offline),
        is_favorite: Boolean(row.is_favorite),
      } as DuplicateBookInfo;
    }),
  );
};

export const handleGetDuplicateGroups = async () => {
  try {
    // id 쌍으로만 그룹을 잡아 두고, 사본 정보는 마지막에 한 번에 채운다
    const idGroups: {
      key: string;
      matchType: DuplicateGroup["matchType"];
      ids: number[];
    }[] = [];
    const rowsById = new Map<number, BookRow>();
    // hitomi_id 그룹에 포함된 book id 집합 (title 그룹 교차 중복 제거용)
    const hitomiGroupedIds = new Set<number>();
    // 이미 만든 그룹의 서명. 정규화 그룹이 같은 구성을 되풀이하는 걸 막는다
    const seenSignatures = new Set<string>();

    // 1) hitomi_id 기준 중복 그룹 — 서브쿼리 1회로 중복 키와 행을 함께 가져옴
    const hitomiRows: BookRow[] = await db("Book")
      .select("*")
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
        rowsById.set(row.id, row);
        hitomiGroupedIds.add(row.id);
      }
      for (const [key, books] of byHitomiId) {
        const ids = books.map((b) => b.id);
        seenSignatures.add(groupSignature(ids));
        idGroups.push({ key, matchType: "hitomi_id", ids });
      }
    }

    // 2) 제목 기준 중복 그룹 — 서브쿼리 1회, 빈 제목은 제외
    const titleRows: BookRow[] = await db("Book")
      .select("*")
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
        for (const row of books) rowsById.set(row.id, row);
        const ids = books.map((b) => b.id);
        seenSignatures.add(groupSignature(ids));
        idGroups.push({ key, matchType: "title", ids });
      }
    }

    // 3) 정규화 제목 기준 그룹 — 표기만 다른 사본을 잡는다.
    //
    // 정규화는 JS에서 하므로 SQL로 중복만 걸러올 수 없다. 대신 두 컬럼만 훑고
    // 중복으로 판명난 id의 행만 뒤에서 채운다. 전량을 select * 하면 5만 권
    // 규모에서 그대로 비용이 된다.
    const titleKeyRows: { id: number; title: string }[] = await db("Book")
      .select("id", "title")
      .where("title", "!=", "")
      .orderBy("id");

    const byNormalizedTitle = new Map<string, number[]>();
    for (const row of titleKeyRows) {
      const key = normalizeTitleKey(row.title);
      // 빈 키는 비교할 알맹이가 없다는 뜻이라 묶지 않는다
      if (!key) continue;
      if (!byNormalizedTitle.has(key)) byNormalizedTitle.set(key, []);
      byNormalizedTitle.get(key)!.push(row.id);
    }

    const normalizedGroups = [...byNormalizedTitle.entries()].filter(
      ([, ids]) => ids.length > 1 && !seenSignatures.has(groupSignature(ids)),
    );

    if (normalizedGroups.length > 0) {
      const missingIds = normalizedGroups
        .flatMap(([, ids]) => ids)
        .filter((id) => !rowsById.has(id));

      if (missingIds.length > 0) {
        const extraRows: BookRow[] = await db("Book")
          .select("*")
          .whereIn("id", missingIds);
        for (const row of extraRows) rowsById.set(row.id, row);
      }

      for (const [key, ids] of normalizedGroups) {
        idGroups.push({ key, matchType: "title_normalized", ids });
      }
    }

    // 그룹이 겹쳐도 책 하나당 한 번만 매핑한다
    const infos = await toBookInfos(Array.from(rowsById.values()));
    const infoById = new Map(infos.map((info) => [info.id, info]));

    const groups: DuplicateGroup[] = idGroups.map(
      ({ key, matchType, ids }) => ({
        key,
        matchType,
        books: ids
          .map((id) => infoById.get(id))
          .filter((book): book is DuplicateBookInfo => !!book),
      }),
    );

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
