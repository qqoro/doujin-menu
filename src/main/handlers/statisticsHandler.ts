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
      duplicateBooks, // 반환 객체에 추가
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
