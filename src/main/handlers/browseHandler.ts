import db from "../db/index.js";
import { ipcMain } from "electron";

// 작가 목록 조회 (책 개수 포함)
export const handleGetArtistsWithCount = async () => {
  return await db("Artist as A")
    .select("A.name")
    .count("BA.book_id as count")
    .join("BookArtist as BA", "A.id", "BA.artist_id")
    .groupBy("A.name")
    .orderBy("A.name");
};

// 태그 목록 조회 (책 개수 포함)
export const handleGetTagsWithCount = async () => {
  return await db("Tag as T")
    .select("T.name")
    .count("BT.book_id as count")
    .join("BookTag as BT", "T.id", "BT.tag_id")
    .groupBy("T.name")
    .orderBy("T.name");
};

// 시리즈 목록 조회 (책 개수 포함)
export const handleGetSeriesWithCount = async () => {
  return await db("Series as S")
    .select("S.name")
    .count("BS.book_id as count")
    .join("BookSeries as BS", "S.id", "BS.series_id")
    .groupBy("S.name")
    .orderBy("S.name");
};

// 캐릭터 목록 조회 (책 개수 포함)
export const handleGetCharactersWithCount = async () => {
  return await db("Character as C")
    .select("C.name")
    .count("BC.book_id as count")
    .join("BookCharacter as BC", "C.id", "BC.character_id")
    .groupBy("C.name")
    .orderBy("C.name");
};

// 그룹 목록 조회 (책 개수 포함)
export const handleGetGroupsWithCount = async () => {
  return await db("Group as G")
    .select("G.name")
    .count("BG.book_id as count")
    .join("BookGroup as BG", "G.id", "BG.group_id")
    .groupBy("G.name")
    .orderBy("G.name");
};

export function registerBrowseHandlers() {
  ipcMain.handle("get-artists-with-count", (_event) =>
    handleGetArtistsWithCount(),
  );
  ipcMain.handle("get-tags-with-count", (_event) => handleGetTagsWithCount());
  ipcMain.handle("get-series-with-count", (_event) =>
    handleGetSeriesWithCount(),
  );
  ipcMain.handle("get-characters-with-count", (_event) =>
    handleGetCharactersWithCount(),
  );
  ipcMain.handle("get-groups-with-count", (_event) =>
    handleGetGroupsWithCount(),
  );
}
