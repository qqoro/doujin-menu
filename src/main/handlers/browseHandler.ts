import db from "../db/index.js";
import { ipcMain } from "electron";
import type { BrowseItem } from "../../types/ipc.js";

/**
 * 이름별 책 개수와 대표 표지(가장 최근에 추가한 책의 썸네일)를 함께 조회한다.
 * 썸네일이 아직 없는 책은 건너뛰고, 추가 시각이 같으면 id가 큰 책을 고른다.
 */
const getNamesWithCover = async (
  nameTable: string,
  joinTable: string,
  foreignKey: string,
): Promise<BrowseItem[]> =>
  await db
    .with("ranked", (qb) =>
      qb
        .select("N.name", "B.cover_path")
        .select(
          db.raw(
            "ROW_NUMBER() OVER (PARTITION BY N.name ORDER BY B.cover_path IS NULL, B.added_at DESC, B.id DESC) AS rn",
          ),
        )
        .from(`${nameTable} as N`)
        .join(`${joinTable} as J`, "N.id", `J.${foreignKey}`)
        .join("Book as B", "B.id", "J.book_id"),
    )
    .select("name")
    .count("* as count")
    .select(db.raw("MAX(CASE WHEN rn = 1 THEN cover_path END) AS cover_path"))
    .from("ranked")
    .groupBy("name")
    .orderBy("name");

// 작가 목록 조회 (책 개수·대표 표지 포함)
export const handleGetArtistsWithCount = () =>
  getNamesWithCover("Artist", "BookArtist", "artist_id");

// 태그 목록 조회 (책 개수 포함). 태그는 한 권으로 대표할 수 없어 표지를 싣지 않는다
export const handleGetTagsWithCount = async () => {
  return await db("Tag as T")
    .select("T.name")
    .count("BT.book_id as count")
    .join("BookTag as BT", "T.id", "BT.tag_id")
    .groupBy("T.name")
    .orderBy("T.name");
};

// 시리즈 목록 조회 (책 개수·대표 표지 포함)
export const handleGetSeriesWithCount = () =>
  getNamesWithCover("Series", "BookSeries", "series_id");

// 캐릭터 목록 조회 (책 개수·대표 표지 포함)
export const handleGetCharactersWithCount = () =>
  getNamesWithCover("Character", "BookCharacter", "character_id");

// 그룹 목록 조회 (책 개수·대표 표지 포함)
export const handleGetGroupsWithCount = () =>
  getNamesWithCover("Group", "BookGroup", "group_id");

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
