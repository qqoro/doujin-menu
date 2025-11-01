import { ipcMain } from "electron";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import db from "../db/index.js";
import { store as configStore } from "./configHandler.js";

async function getFolderSize(directoryPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const files = await readdir(directoryPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = join(directoryPath, file.name);
      try {
        if (file.isDirectory()) {
          totalSize += await getFolderSize(fullPath);
        } else {
          const stats = await stat(fullPath);
          totalSize += stats.size;
        }
      } catch (err) {
        console.warn(`Error accessing ${fullPath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${directoryPath}:`, err);
  }
  return totalSize;
}

export const handleGetStatistics = async () => {
  try {
    // 총 책 권수
    const totalBooksResult = await db("Book").count("* as count").first();
    const totalBooks = totalBooksResult
      ? (totalBooksResult.count as number)
      : 0;

    // 가장 많이 등장하는 태그 (상위 10개)
    const topTags = await db("Tag as T")
      .select("T.name")
      .count("BT.book_id as count")
      .join("BookTag as BT", "T.id", "BT.tag_id")
      .groupBy("T.name")
      .orderBy("count", "desc")
      .limit(10);

    // 가장 많이 등장하는 작가 (상위 10개)
    const topArtists = await db("Artist as A")
      .select("A.name")
      .count("BA.book_id as count")
      .join("BookArtist as BA", "A.id", "BA.artist_id")
      .groupBy("A.name")
      .orderBy("count", "desc")
      .limit(10);

    // 가장 자주 본 책 (상위 10개)
    const mostViewedBooks = await db("BookHistory as BH")
      .select("B.id", "B.title")
      .count("BH.book_id as view_count")
      .join("Book as B", "B.id", "BH.book_id")
      .groupBy("B.id", "B.title")
      .orderBy("view_count", "desc")
      .limit(10);

    // 가장 긴 책 (페이지 수 기준)
    const longestBook = await db("Book")
      .select("id", "title", "page_count")
      .whereNotNull("page_count")
      .orderBy("page_count", "desc")
      .first();

    // 가장 짧은 책 (페이지 수 기준)
    const shortestBook = await db("Book")
      .select("id", "title", "page_count")
      .whereNotNull("page_count")
      .orderBy("page_count", "asc")
      .first();

    // 총 태그 개수
    const totalTagsResult = await db("Tag").count("* as count").first();
    const totalTags = totalTagsResult ? (totalTagsResult.count as number) : 0;

    // 총 작가 개수
    const totalArtistsResult = await db("Artist").count("* as count").first();
    const totalArtists = totalArtistsResult
      ? (totalArtistsResult.count as number)
      : 0;

    // 총 시리즈 개수
    const totalSeriesResult = await db("Series").count("* as count").first();
    const totalSeries = totalSeriesResult
      ? (totalSeriesResult.count as number)
      : 0;

    // 중복된 책 조회 (제목 기준)
    const duplicateBooksByTitle = await db("Book")
      .select("title")
      .count("* as count")
      .groupBy("title")
      .having("count", ">", 1)
      .orderBy("count", "desc");

    // 중복된 책 조회 (hitomi_id 기준)
    const duplicateBooksByHitomiId = await db("Book")
      .select("hitomi_id")
      .count("* as count")
      .whereNotNull("hitomi_id")
      .groupBy("hitomi_id")
      .having("count", ">", 1)
      .orderBy("count", "desc");

    const duplicateBooks = {
      byTitle: duplicateBooksByTitle,
      byHitomiId: duplicateBooksByHitomiId,
    };

    // 읽기 진행 상황
    // 다 읽은 책: current_page >= page_count
    const readBooks = await db("Book")
      .where("current_page", ">", 0)
      .whereRaw("current_page >= page_count")
      .count("* as count")
      .first();

    // 읽는 중인 책: 1 < current_page < page_count (1페이지만 본 책 제외)
    const readingBooks = await db("Book")
      .where("current_page", ">", 1)
      .whereRaw("current_page < page_count")
      .count("* as count")
      .first();

    // 안읽은 책: current_page = 0 또는 null 또는 1 (1페이지만 본 책 포함)
    const unreadBooks = await db("Book")
      .where((builder) => {
        builder
          .where("current_page", 0)
          .orWhere("current_page", 1)
          .orWhereNull("current_page");
      })
      .count("* as count")
      .first();
    const favoriteBooks = await db("Book")
      .where("is_favorite", true)
      .count("* as count")
      .first();

    const readingProgress = {
      read: readBooks ? (readBooks.count as number) : 0,
      reading: readingBooks ? (readingBooks.count as number) : 0,
      unread: unreadBooks ? (unreadBooks.count as number) : 0,
      favorites: favoriteBooks ? (favoriteBooks.count as number) : 0,
    };

    // 총 페이지 수 및 평균
    const pageStats = await db("Book")
      .sum("page_count as totalPages")
      .avg("page_count as averagePages")
      .whereNotNull("page_count")
      .first();

    const totalPages = pageStats?.totalPages
      ? Math.floor(pageStats.totalPages as number)
      : 0;
    const averagePages = pageStats?.averagePages
      ? Math.floor(pageStats.averagePages as number)
      : 0;

    // 읽은 페이지 수 계산
    // 1. 다 읽은 책들의 페이지 수 합계
    const completedPagesStats = await db("Book")
      .sum("page_count as completedPages")
      .where("current_page", ">", 0)
      .whereRaw("current_page >= page_count")
      .whereNotNull("page_count")
      .first();

    // 2. 읽는 중인 책들의 현재 페이지 합계 (1페이지 초과한 책만)
    const readingPagesStats = await db("Book")
      .sum("current_page as readingPages")
      .where("current_page", ">", 1)
      .whereRaw("current_page < page_count")
      .first();

    const completedPages = completedPagesStats?.completedPages
      ? Math.floor(completedPagesStats.completedPages as number)
      : 0;
    const readingPages = readingPagesStats?.readingPages
      ? Math.floor(readingPagesStats.readingPages as number)
      : 0;

    const readPages = completedPages + readingPages;

    // 가장 많이 등장하는 그룹 (상위 10개)
    const topGroups = await db("Group as G")
      .select("G.name")
      .count("BG.book_id as count")
      .join("BookGroup as BG", "G.id", "BG.group_id")
      .groupBy("G.name")
      .orderBy("count", "desc")
      .limit(10);

    // 가장 많이 등장하는 캐릭터 (상위 10개)
    const topCharacters = await db("Character as C")
      .select("C.name")
      .count("BC.book_id as count")
      .join("BookCharacter as BC", "C.id", "BC.character_id")
      .groupBy("C.name")
      .orderBy("count", "desc")
      .limit(10);

    // 가장 많은 책이 있는 시리즈 (상위 5개)
    const topSeries = await db("Series as S")
      .select("S.name")
      .count("BS.book_id as count")
      .join("BookSeries as BS", "S.id", "BS.series_id")
      .groupBy("S.name")
      .orderBy("count", "desc")
      .limit(5);

    // 타입별 분포
    const typeDistribution = await db("Book")
      .select("type")
      .count("* as count")
      .whereNotNull("type")
      .groupBy("type")
      .orderBy("count", "desc");

    return {
      totalBooks,
      topTags,
      topArtists,
      mostViewedBooks,
      longestBook,
      shortestBook,
      totalTags,
      totalArtists,
      totalSeries,
      duplicateBooks,
      readingProgress,
      totalPages,
      readPages,
      averagePages,
      topGroups,
      topCharacters,
      topSeries,
      typeDistribution,
    };
  } catch (error) {
    console.error("Failed to get statistics:", error);
    throw error;
  }
};

export const handleGetLibrarySize = async () => {
  try {
    let totalLibrarySize = 0;
    const libraryFolders = configStore.store.libraryFolders || [];
    for (const folderPath of libraryFolders) {
      totalLibrarySize += await getFolderSize(folderPath);
    }
    return totalLibrarySize;
  } catch (error) {
    console.error("Failed to get library size:", error);
    throw error;
  }
};

export function registerStatisticsHandlers() {
  ipcMain.handle("get-statistics", (_event) => handleGetStatistics());
  ipcMain.handle("get-library-size", (_event) => handleGetLibrarySize());
}
