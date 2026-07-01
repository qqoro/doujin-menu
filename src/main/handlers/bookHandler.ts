import { ipcMain, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import * as yauzl from "yauzl";
import type { FilterParams } from "../../types/ipc.js";
import db from "../db/index.js";
import { console } from "../main.js";
import { naturalSort } from "../utils/index.js";
import { store as configStore } from "./configHandler.js";

export interface ExcludeTerms {
  titleTerms: string[];
  idTerms: string[];
  artistTerms: string[];
  tagTerms: string[];
  seriesTerms: string[];
  groupTerms: string[];
  typeTerms: string[];
  languageTerms: string[];
  characterTerms: string[];
}

export interface ParsedSearchTerms extends ExcludeTerms {
  exclude: ExcludeTerms;
}

const PREFIXED_TERM_REGEX =
  /(-?)(id|artist|group|type|language|series|character|tag):(.+?)(?=\s+(?!(?:-?(?:id|artist|group|type|language|series|character|tag)):)|\s*-?(?:id|artist|group|type|language|series|character|tag):|$)/g;

// 검색어 문자열을 프리픽스별로 분류하여 반환
export function parseSearchQuery(searchQuery: string): ParsedSearchTerms {
  const result: ParsedSearchTerms = {
    titleTerms: [],
    idTerms: [],
    artistTerms: [],
    tagTerms: [],
    seriesTerms: [],
    groupTerms: [],
    typeTerms: [],
    languageTerms: [],
    characterTerms: [],
    exclude: {
      titleTerms: [],
      idTerms: [],
      artistTerms: [],
      tagTerms: [],
      seriesTerms: [],
      groupTerms: [],
      typeTerms: [],
      languageTerms: [],
      characterTerms: [],
    },
  };

  if (!searchQuery) return result;

  const lowerCaseQuery = searchQuery.toLowerCase();
  const rawTitleTerms: string[] = [];

  let lastIndex = 0;
  let match;

  while ((match = PREFIXED_TERM_REGEX.exec(lowerCaseQuery)) !== null) {
    const isNegated = match[1] === "-";
    const prefix = match[2];
    const value = match[3].trim();

    const leadingText = lowerCaseQuery.substring(lastIndex, match.index).trim();
    if (leadingText) {
      rawTitleTerms.push(...leadingText.split(" ").filter((t) => t.length > 0));
    }

    const target = isNegated ? result.exclude : result;
    switch (prefix) {
      case "id":
        target.idTerms.push(value);
        break;
      case "artist":
        target.artistTerms.push(value);
        break;
      case "group":
        target.groupTerms.push(value);
        break;
      case "type":
        target.typeTerms.push(value);
        break;
      case "language":
        target.languageTerms.push(value);
        break;
      case "series":
        target.seriesTerms.push(value);
        break;
      case "character":
        target.characterTerms.push(value);
        break;
      case "tag":
        target.tagTerms.push(value);
        break;
    }
    lastIndex = PREFIXED_TERM_REGEX.lastIndex;
  }

  const remainingText = lowerCaseQuery.substring(lastIndex).trim();
  if (remainingText) {
    rawTitleTerms.push(...remainingText.split(" ").filter((t) => t.length > 0));
  }

  // male:/female: 접두사가 있는 항목은 tagTerms로 이동, - 접두사는 제외 조건으로 분류
  for (const term of rawTitleTerms) {
    if (term.startsWith("-")) {
      const stripped = term.slice(1);
      if (stripped.startsWith("male:") || stripped.startsWith("female:")) {
        result.exclude.tagTerms.push(stripped);
      } else if (stripped) {
        result.exclude.titleTerms.push(stripped);
      }
    } else if (term.startsWith("male:") || term.startsWith("female:")) {
      result.tagTerms.push(term);
    } else {
      result.titleTerms.push(term);
    }
  }

  return result;
}

const createKoreanRegexp = () => /^.+\|\s?(.+)$/;

// 한국어 우선 제목 설정이 활성화된 경우 "영어 | 한글" 형식에서 한글 부분만 추출
export function extractKoreanTitle(
  title: string,
  prioritizeKorean: boolean,
): string {
  if (!prioritizeKorean) return title;
  const match = createKoreanRegexp().exec(title);
  return match?.[1]?.trim() ?? title;
}

function buildFilteredQuery(filter: FilterParams | null) {
  const {
    searchQuery = "",
    readStatus = "all",
    isFavorite = false,
    libraryPath = "",
    offlineStatus = "all",
  } = filter || {};

  const subquery = db("Book")
    .select(
      "Book.*",
      db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
      db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      db.raw("GROUP_CONCAT(DISTINCT Series.name) as series"),
      db.raw("GROUP_CONCAT(DISTINCT `Group`.name) as groups"),
      db.raw("GROUP_CONCAT(DISTINCT `Character`.name) as characters"),
    )
    .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
    .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
    .leftJoin("BookTag", "Book.id", "BookTag.book_id")
    .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
    .leftJoin("BookSeries", "Book.id", "BookSeries.book_id")
    .leftJoin("Series", "BookSeries.series_id", "Series.id")
    .leftJoin("BookGroup", "Book.id", "BookGroup.book_id")
    .leftJoin("Group", "BookGroup.group_id", "Group.id")
    .leftJoin("BookCharacter", "Book.id", "BookCharacter.book_id")
    .leftJoin("Character", "BookCharacter.character_id", "Character.id")
    .groupBy("Book.id");

  const mainQuery = db(subquery.as("sub"));

  if (libraryPath && libraryPath !== "all") {
    mainQuery.where("sub.path", "like", `${libraryPath}%`);
  }

  if (searchQuery) {
    const {
      titleTerms,
      idTerms,
      artistTerms,
      tagTerms,
      seriesTerms,
      groupTerms,
      typeTerms,
      languageTerms,
      characterTerms,
      exclude,
    } = parseSearchQuery(searchQuery);

    if (idTerms.length > 0) {
      mainQuery.whereIn("sub.hitomi_id", idTerms);
    }
    if (artistTerms.length > 0) {
      for (const artist of artistTerms) {
        mainQuery.whereExists(function () {
          this.from("BookArtist")
            .innerJoin("Artist", "BookArtist.artist_id", "Artist.id")
            .whereRaw("BookArtist.book_id = sub.id")
            .whereRaw("LOWER(Artist.name) = ?", [artist]);
        });
      }
    }
    if (groupTerms.length > 0) {
      for (const group of groupTerms) {
        mainQuery.whereExists(function () {
          this.from("BookGroup")
            .innerJoin("Group", "BookGroup.group_id", "Group.id")
            .whereRaw("BookGroup.book_id = sub.id")
            .whereRaw("LOWER(`Group`.name) = ?", [group]);
        });
      }
    }
    if (typeTerms.length > 0) {
      for (const type of typeTerms) {
        mainQuery.whereRaw("LOWER(sub.type) LIKE ?", [`%${type}%`]);
      }
    }
    if (languageTerms.length > 0) {
      for (const language of languageTerms) {
        mainQuery.whereRaw(
          "LOWER(sub.language_name_english) LIKE ? OR LOWER(sub.language_name_local) LIKE ?",
          [`%${language}%`, `%${language}%`],
        );
      }
    }
    if (characterTerms.length > 0) {
      for (const character of characterTerms) {
        mainQuery.whereExists(function () {
          this.from("BookCharacter")
            .innerJoin(
              "Character",
              "BookCharacter.character_id",
              "Character.id",
            )
            .whereRaw("BookCharacter.book_id = sub.id")
            .whereRaw("LOWER(`Character`.name) = ?", [character]);
        });
      }
    }
    if (tagTerms.length > 0) {
      for (const tag of tagTerms) {
        mainQuery.whereExists(function () {
          this.from("BookTag")
            .innerJoin("Tag", "BookTag.tag_id", "Tag.id")
            .whereRaw("BookTag.book_id = sub.id")
            .whereRaw("LOWER(Tag.name) = ?", [tag]);
        });
      }
    }
    if (seriesTerms.length > 0) {
      for (const seriesName of seriesTerms) {
        mainQuery.whereExists(function () {
          this.from("BookSeries")
            .innerJoin("Series", "BookSeries.series_id", "Series.id")
            .whereRaw("BookSeries.book_id = sub.id")
            .whereRaw("LOWER(Series.name) = ?", [seriesName]);
        });
      }
    }
    if (titleTerms.length > 0) {
      for (const titleTerm of titleTerms) {
        mainQuery.whereRaw("LOWER(sub.title) LIKE ?", [`%${titleTerm}%`]);
      }
    }

    // 제외 조건 적용
    if (exclude.idTerms.length > 0) {
      mainQuery.whereNotIn("sub.hitomi_id", exclude.idTerms);
    }
    if (exclude.artistTerms.length > 0) {
      for (const artist of exclude.artistTerms) {
        mainQuery.whereNotExists(function () {
          this.from("BookArtist")
            .innerJoin("Artist", "BookArtist.artist_id", "Artist.id")
            .whereRaw("BookArtist.book_id = sub.id")
            .whereRaw("LOWER(Artist.name) = ?", [artist]);
        });
      }
    }
    if (exclude.groupTerms.length > 0) {
      for (const group of exclude.groupTerms) {
        mainQuery.whereNotExists(function () {
          this.from("BookGroup")
            .innerJoin("Group", "BookGroup.group_id", "Group.id")
            .whereRaw("BookGroup.book_id = sub.id")
            .whereRaw("LOWER(`Group`.name) = ?", [group]);
        });
      }
    }
    if (exclude.typeTerms.length > 0) {
      for (const type of exclude.typeTerms) {
        mainQuery.whereRaw("LOWER(sub.type) NOT LIKE ?", [`%${type}%`]);
      }
    }
    if (exclude.languageTerms.length > 0) {
      for (const language of exclude.languageTerms) {
        mainQuery.whereRaw(
          "LOWER(sub.language_name_english) NOT LIKE ? AND LOWER(sub.language_name_local) NOT LIKE ?",
          [`%${language}%`, `%${language}%`],
        );
      }
    }
    if (exclude.characterTerms.length > 0) {
      for (const character of exclude.characterTerms) {
        mainQuery.whereNotExists(function () {
          this.from("BookCharacter")
            .innerJoin(
              "Character",
              "BookCharacter.character_id",
              "Character.id",
            )
            .whereRaw("BookCharacter.book_id = sub.id")
            .whereRaw("LOWER(`Character`.name) = ?", [character]);
        });
      }
    }
    if (exclude.tagTerms.length > 0) {
      for (const tag of exclude.tagTerms) {
        mainQuery.whereNotExists(function () {
          this.from("BookTag")
            .innerJoin("Tag", "BookTag.tag_id", "Tag.id")
            .whereRaw("BookTag.book_id = sub.id")
            .whereRaw("LOWER(Tag.name) = ?", [tag]);
        });
      }
    }
    if (exclude.seriesTerms.length > 0) {
      for (const seriesName of exclude.seriesTerms) {
        mainQuery.whereNotExists(function () {
          this.from("BookSeries")
            .innerJoin("Series", "BookSeries.series_id", "Series.id")
            .whereRaw("BookSeries.book_id = sub.id")
            .whereRaw("LOWER(Series.name) = ?", [seriesName]);
        });
      }
    }
    if (exclude.titleTerms.length > 0) {
      for (const titleTerm of exclude.titleTerms) {
        mainQuery.whereRaw("LOWER(sub.title) NOT LIKE ?", [`%${titleTerm}%`]);
      }
    }
  }

  if (readStatus === "read") {
    mainQuery.whereNotNull("sub.last_read_at");
  } else if (readStatus === "unread") {
    mainQuery.whereNull("sub.last_read_at");
  }

  if (isFavorite) {
    mainQuery.where("sub.is_favorite", true);
  }

  // 오프라인 상태 필터 (외장하드 분리 등으로 접근 불가한 책)
  if (offlineStatus === "online") {
    mainQuery.where("sub.is_offline", false);
  } else if (offlineStatus === "offline") {
    mainQuery.where("sub.is_offline", true);
  }

  return mainQuery;
}

export const handleGetBooks = async (
  params: FilterParams & { pageParam?: number; pageSize?: number },
) => {
  const {
    pageParam = 0,
    pageSize = 50,
    sortBy = "added_at",
    sortOrder = "desc",
  } = params;

  const mainQuery = buildFilteredQuery(params);

  // 3. 필터가 적용된 상태에서 전체 카운트 계산
  const totalCountQuery = mainQuery.clone().count("* as count").first();
  const totalBooks = await totalCountQuery;

  // 4. 정렬 및 페이지네이션 적용
  if (sortBy === "random") {
    // 랜덤 정렬: SQLite RANDOM() 함수 사용
    mainQuery.orderByRaw("RANDOM()");
  } else if (sortBy === "hitomi_id") {
    mainQuery.orderByRaw(
      `CAST(sub.hitomi_id AS INTEGER) ${sortOrder}, sub.id ${sortOrder}`,
    );
  } else {
    mainQuery.orderBy(`sub.${sortBy}`, sortOrder).orderBy("sub.id", sortOrder);
  }
  mainQuery.offset(pageParam * pageSize).limit(pageSize);

  const books = await mainQuery;

  const prioritizeKoreanTitles = configStore.get(
    "prioritizeKoreanTitles",
    false,
  );

  const formattedBooks = books.map((book) => ({
    ...book,
    title: extractKoreanTitle(book.title, prioritizeKoreanTitles),
    artists: book.artists
      ? book.artists.split(",").map((name: string) => ({ name }))
      : [],
    tags: book.tags
      ? book.tags.split(",").map((name: string) => ({ name }))
      : [],
    series: book.series
      ? book.series.split(",").map((name: string) => ({ name }))
      : [],
    groups: book.groups
      ? book.groups.split(",").map((name: string) => ({ name }))
      : [],
    characters: book.characters
      ? book.characters.split(",").map((name: string) => ({ name }))
      : [],
  }));

  return {
    data: formattedBooks,
    hasNextPage: (pageParam + 1) * pageSize < Number(totalBooks?.count || 0),
    nextPage: pageParam + 1,
  };
};

export const handleGetBook = async (bookId: number) => {
  const book = await buildFilteredQuery({}).where("sub.id", bookId).first();

  if (!book) {
    return null;
  }

  const prioritizeKoreanTitles = configStore.get(
    "prioritizeKoreanTitles",
    false,
  );

  return {
    ...book,
    title: extractKoreanTitle(book.title, prioritizeKoreanTitles),
    artists: book.artists
      ? book.artists.split(",").map((name: string) => ({ name }))
      : [],
    tags: book.tags
      ? book.tags.split(",").map((name: string) => ({ name }))
      : [],
    series: book.series
      ? book.series.split(",").map((name: string) => ({ name }))
      : [],
    groups: book.groups
      ? book.groups.split(",").map((name: string) => ({ name }))
      : [],
    characters: book.characters
      ? book.characters.split(",").map((name: string) => ({ name }))
      : [],
  };
};

export const handleGetTags = async () => {
  return await db("Tag").select("*");
};

export const handleGetArtists = async () => {
  return await db("Artist").select("*");
};

export const handleGetSeries = async () => {
  return await db("Series").select("*");
};

export const handleGetGroups = async () => {
  return await db("Group").select("*");
};

export const handleGetCharacters = async () => {
  return await db("Character").select("*");
};

export const handleGetTypes = async () => {
  return await db("Book").distinct("type").whereNotNull("type").select("type");
};

export const handleGetLanguages = async () => {
  const languages = await db("Book")
    .distinct("language_name_english", "language_name_local")
    .whereNotNull("language_name_english")
    .orWhereNotNull("language_name_local")
    .select("language_name_english", "language_name_local");

  const uniqueLanguages = new Set<string>();
  languages.forEach(
    (lang: {
      language_name_english?: string;
      language_name_local?: string;
    }) => {
      if (lang.language_name_english)
        uniqueLanguages.add(lang.language_name_english);
      if (lang.language_name_local)
        uniqueLanguages.add(lang.language_name_local);
    },
  );
  return Array.from(uniqueLanguages).map((name) => ({ name }));
};

export const handleGetBookPagePaths = async (bookId: number) => {
  try {
    const book = await db("Book").where("id", bookId).first();

    if (!book || !book.path) {
      console.error(
        `[Main] Book not found or path missing for bookId: ${bookId}`,
      );
      return { success: false, error: "Book not found or path missing" };
    }

    const bookPath = book.path;
    const pagePaths: string[] = [];

    // 폴더인 경우
    const isDirectory = await fs
      .stat(bookPath)
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    if (isDirectory) {
      const files = await fs.readdir(bookPath);
      const imageFiles = files
        .filter((file) => file.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i))
        .sort(naturalSort);
      for (let i = 0; i < imageFiles.length; i++) {
        pagePaths.push(`doujin-menu://${bookId}/${i}`);
      }
      return {
        success: true,
        data: pagePaths,
        title: book.title,
        is_favorite: book.is_favorite,
      };
    } else if (/.(cbz|zip)$/i.exec(bookPath)) {
      // ZIP 파일 처리
      return new Promise((resolve, reject) => {
        yauzl.open(
          bookPath,
          { lazyEntries: true, autoClose: false },
          (err, zipfile) => {
            if (err) {
              console.error(`[Main] Error opening zip file ${bookPath}:`, err);
              return reject({
                success: false,
                error: "Failed to open zip file",
              });
            }

            const imageEntries: { fileName: string; entry: yauzl.Entry }[] = [];
            zipfile.on("entry", (entry) => {
              // 폴더 엔트리 무시
              if (entry.fileName.endsWith("/")) {
                zipfile.readEntry();
                return;
              }

              const ext = path.extname(entry.fileName).toLowerCase();
              if (
                [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext)
              ) {
                imageEntries.push({ fileName: entry.fileName, entry });
              }
              zipfile.readEntry();
            });

            zipfile.on("end", () => {
              imageEntries.sort((a, b) => naturalSort(a.fileName, b.fileName)); // 파일명으로 정렬
              for (let i = 0; i < imageEntries.length; i++) {
                pagePaths.push(`doujin-menu://${bookId}/${i}`);
              }
              zipfile.close();
              resolve({
                success: true,
                data: pagePaths,
                title: book.title,
                is_favorite: book.is_favorite,
              });
            });

            zipfile.on("error", (zipErr) => {
              console.error(`[Main] Zip file error for ${bookPath}:`, zipErr);
              zipfile.close();
              reject({ success: false, error: "Error reading zip file" });
            });

            zipfile.readEntry(); // 첫 번째 엔트리 읽기 시작
          },
        );
      });
    } else {
      console.warn(
        `[Main] Unsupported book format for bookId: ${bookId}, path: ${bookPath}`,
      );
      return { success: false, error: "Unsupported book format" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Main] Error getting book page paths for bookId ${bookId}:`,
      error,
    );
    return { success: false, error: message };
  }
};

export const handleUpdateBookCurrentPage = async ({
  bookId,
  currentPage,
}: {
  bookId: number;
  currentPage: number;
}) => {
  try {
    await db("Book")
      .where("id", bookId)
      .update({ current_page: currentPage, last_read_at: db.fn.now() });
    return { success: true };
  } catch (error) {
    console.error("Failed to update current page:", error);
    return { success: false, error };
  }
};

export const handleGetBookCurrentPage = async (bookId: number) => {
  try {
    const book = await db("Book").where("id", bookId).first();
    return { success: true, currentPage: book?.current_page || 1 };
  } catch (error) {
    console.error("Failed to get current page:", error);
    return { success: false, error };
  }
};

export const handleGetLibraryFolderStats = async (folderPath: string) => {
  try {
    const result = await db("Book")
      .where("path", "like", `${folderPath}%`)
      .count("* as bookCount")
      .max("added_at as lastScanned")
      .first();

    return { success: true, data: result };
  } catch (error) {
    console.error(`Failed to get stats for folder ${folderPath}:`, error);
    return { success: false, error };
  }
};

export const handleGetNextBook = async ({
  currentBookId,
  mode,
  filter,
}: {
  currentBookId: number;
  mode: "next" | "random";
  filter: FilterParams | null;
}) => {
  try {
    const mainQuery = buildFilteredQuery(filter);

    const viewerExcludeCompleted = configStore.get("viewerExcludeCompleted");
    if (viewerExcludeCompleted) {
      mainQuery.where((builder) =>
        builder
          .whereNull("sub.page_count")
          .orWhere("sub.page_count", 0)
          .orWhereNull("sub.current_page")
          .orWhereRaw("sub.current_page < sub.page_count"),
      );
    }

    const { sortBy = "added_at", sortOrder = "desc" } = filter || {};

    // 랜덤 정렬이거나 random 모드인 경우 완전 랜덤 책으로 이동
    if (mode === "random" || sortBy === "random") {
      const randomBook = await mainQuery
        .whereNot("sub.id", currentBookId)
        .orderByRaw("RANDOM()")
        .first();
      if (randomBook) {
        return {
          success: true,
          nextBookId: randomBook.id,
          nextBookTitle: randomBook.title,
        };
      }
      return { success: true, nextBookId: null };
    }

    // Sequential mode
    const currentBook = await buildFilteredQuery(null)
      .where("sub.id", currentBookId)
      .first();
    if (!currentBook) {
      return { success: false, error: "Current book not found" };
    }

    if (sortBy === "hitomi_id") {
      // CAST(NULL AS INTEGER) = NULL 이라 0 비교로 매칭되지 않으므로, hitomi_id가 NULL인 책은
      // SQLite 정렬 규칙(asc=최소·맨 앞, desc=최대·맨 뒤)에 맞춰 별도 분기한다.
      const rawHitomiId = currentBook.hitomi_id;
      const isNullValue = rawHitomiId === null || rawHitomiId === undefined;
      if (isNullValue) {
        if (sortOrder === "desc") {
          // desc 그리드: 값 있는 책(CAST desc) → NULL 그룹(id desc). 다음은 같은 NULL 그룹 내 id가 더 작은 책.
          mainQuery
            .whereNull("sub.hitomi_id")
            .where("sub.id", "<", currentBookId);
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) DESC, sub.id DESC",
          );
        } else {
          // asc 그리드: NULL 그룹(id asc)이 맨 앞. 다음은 같은 NULL 그룹 내 id가 더 큰 책,
          // 또는 값 있는 모든 책(NULL이 가장 작으므로 뒤에 옴).
          mainQuery.where((builder) =>
            builder
              .whereNotNull("sub.hitomi_id")
              .orWhere((b) =>
                b
                  .whereNull("sub.hitomi_id")
                  .where("sub.id", ">", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC",
          );
        }
      } else {
        const sortValue = Number(rawHitomiId);
        if (sortOrder === "desc") {
          mainQuery.where((builder) =>
            builder
              .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "<", sortValue)
              .orWhere((b) =>
                b
                  .where(
                    db.raw("CAST(sub.hitomi_id AS INTEGER)"),
                    "=",
                    sortValue,
                  )
                  .where("sub.id", "<", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) DESC, sub.id DESC",
          );
        } else {
          mainQuery.where((builder) =>
            builder
              .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), ">", sortValue)
              .orWhere((b) =>
                b
                  .where(
                    db.raw("CAST(sub.hitomi_id AS INTEGER)"),
                    "=",
                    sortValue,
                  )
                  .where("sub.id", ">", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC",
          );
        }
      }
    } else {
      const sortColumn = `sub.${sortBy}`;
      const sortValue = currentBook[sortBy];
      // 정렬 값이 NULL인 책(예: 작가/태그 메타데이터가 없는 책)도 커서 비교가 깨지지 않도록
      // NULL을 SQLite 정렬 규칙(asc=최소, desc=최대)에 맞춰 별도 분기로 처리한다.
      const isNullValue = sortValue === null || sortValue === undefined;
      if (sortOrder === "desc") {
        // desc 그리드 순서: 값 있는 책(col desc) → NULL 그룹(id desc)
        if (isNullValue) {
          // 현재 책이 NULL 그룹 → 다음은 같은 NULL 그룹 내 id가 더 작은 책뿐
          mainQuery.whereNull(sortColumn).where("sub.id", "<", currentBookId);
        } else {
          mainQuery.where((builder) =>
            builder
              .where(sortColumn, "<", sortValue)
              .orWhere((b) =>
                b
                  .where(sortColumn, "=", sortValue)
                  .where("sub.id", "<", currentBookId),
              ),
          );
        }
        mainQuery.orderBy(sortColumn, "desc").orderBy("sub.id", "desc");
      } else {
        // asc 그리드 순서: NULL 그룹(id asc) → 값 있는 책(col asc)
        if (isNullValue) {
          // 현재 책이 NULL 그룹(맨 앞) → 다음은 같은 NULL 그룹 내 id가 더 큰 책,
          // 또는 정렬 값이 있는 모든 책(NULL이 가장 작으므로 뒤에 옴)
          mainQuery.where((builder) =>
            builder
              .whereNotNull(sortColumn)
              .orWhere((b) =>
                b.whereNull(sortColumn).where("sub.id", ">", currentBookId),
              ),
          );
        } else {
          mainQuery.where((builder) =>
            builder
              .where(sortColumn, ">", sortValue)
              .orWhere((b) =>
                b
                  .where(sortColumn, "=", sortValue)
                  .where("sub.id", ">", currentBookId),
              ),
          );
        }
        mainQuery.orderBy(sortColumn, "asc").orderBy("sub.id", "asc");
      }
    }

    const nextBook = await mainQuery.first();

    if (nextBook) {
      return {
        success: true,
        nextBookId: nextBook.id,
        nextBookTitle: nextBook.title,
      };
    } else {
      return { success: true, nextBookId: null };
    }
  } catch (error) {
    console.error("Failed to get next book:", error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleGetPrevBook = async ({
  currentBookId,
  filter,
}: {
  currentBookId: number;
  filter: FilterParams | null;
}) => {
  try {
    const mainQuery = buildFilteredQuery(filter);
    const { sortBy = "added_at", sortOrder = "desc" } = filter || {};

    // 랜덤 정렬인 경우 완전 랜덤 책으로 이동
    if (sortBy === "random") {
      const randomBook = await mainQuery
        .whereNot("sub.id", currentBookId)
        .orderByRaw("RANDOM()")
        .first();
      if (randomBook) {
        return {
          success: true,
          prevBookId: randomBook.id,
          prevBookTitle: randomBook.title,
        };
      }
      return { success: true, prevBookId: null };
    }

    const currentBook = await buildFilteredQuery(null)
      .where("sub.id", currentBookId)
      .first();
    if (!currentBook) {
      return { success: false, error: "Current book not found" };
    }

    if (sortBy === "hitomi_id") {
      // hitomi_id가 NULL인 책도 커서 비교가 깨지지 않도록 SQLite 정렬 규칙에 맞춰 처리.
      const rawHitomiId = currentBook.hitomi_id;
      const isNullValue = rawHitomiId === null || rawHitomiId === undefined;
      if (isNullValue) {
        if (sortOrder === "desc") {
          // desc 그리드 역순 정렬로 first → 현재 직전.
          // 앞 = 값 있는 모든 책(NULL보다 앞) 또는 같은 NULL 그룹 내 id가 더 큰 책(desc 그리드에서 id가 클수록 앞).
          mainQuery.where((builder) =>
            builder
              .whereNotNull("sub.hitomi_id")
              .orWhere((b) =>
                b
                  .whereNull("sub.hitomi_id")
                  .where("sub.id", ">", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC",
          );
        } else {
          // asc 그리드 역순 정렬로 first. 앞 = 같은 NULL 그룹 내 id가 더 작은 책뿐.
          mainQuery
            .whereNull("sub.hitomi_id")
            .where("sub.id", "<", currentBookId);
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) DESC, sub.id DESC",
          );
        }
      } else {
        const sortValue = Number(rawHitomiId);
        if (sortOrder === "desc") {
          mainQuery.where((builder) =>
            builder
              .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), ">", sortValue)
              .orWhere((b) =>
                b
                  .where(
                    db.raw("CAST(sub.hitomi_id AS INTEGER)"),
                    "=",
                    sortValue,
                  )
                  .where("sub.id", ">", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC",
          );
        } else {
          mainQuery.where((builder) =>
            builder
              .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "<", sortValue)
              .orWhere((b) =>
                b
                  .where(
                    db.raw("CAST(sub.hitomi_id AS INTEGER)"),
                    "=",
                    sortValue,
                  )
                  .where("sub.id", "<", currentBookId),
              ),
          );
          mainQuery.orderByRaw(
            "CAST(sub.hitomi_id AS INTEGER) DESC, sub.id DESC",
          );
        }
      }
    } else {
      const sortColumn = `sub.${sortBy}`;
      const sortValue = currentBook[sortBy];
      // 정렬 값이 NULL인 책도 커서 비교가 깨지지 않도록 SQLite 정렬 규칙에 맞춰 처리.
      const isNullValue = sortValue === null || sortValue === undefined;
      if (sortOrder === "desc") {
        // desc 그리드 순서: 값 있는 책(col desc) → NULL 그룹(id desc)
        if (isNullValue) {
          // 현재 책이 NULL 그룹 → 이전은 값 있는 모든 책(NULL보다 앞) 또는
          // 같은 NULL 그룹 내 id가 더 큰 책(desc 그리드에서 id가 클수록 앞)
          mainQuery.where((builder) =>
            builder
              .whereNotNull(sortColumn)
              .orWhere((b) =>
                b.whereNull(sortColumn).where("sub.id", ">", currentBookId),
              ),
          );
        } else {
          mainQuery.where((builder) =>
            builder
              .where(sortColumn, ">", sortValue)
              .orWhere((b) =>
                b
                  .where(sortColumn, "=", sortValue)
                  .where("sub.id", ">", currentBookId),
              ),
          );
        }
        mainQuery.orderBy(sortColumn, "asc").orderBy("sub.id", "asc");
      } else {
        // asc 그리드 순서: NULL 그룹(id asc) → 값 있는 책(col asc)
        if (isNullValue) {
          // 현재 책이 NULL 그룹(맨 앞) → 이전은 같은 NULL 그룹 내 id가 더 작은 책뿐
          mainQuery.whereNull(sortColumn).where("sub.id", "<", currentBookId);
        } else {
          mainQuery.where((builder) =>
            builder
              .where(sortColumn, "<", sortValue)
              .orWhere((b) =>
                b
                  .where(sortColumn, "=", sortValue)
                  .where("sub.id", "<", currentBookId),
              ),
          );
        }
        mainQuery.orderBy(sortColumn, "desc").orderBy("sub.id", "desc");
      }
    }

    const prevBook = await mainQuery.first();

    if (prevBook) {
      return {
        success: true,
        prevBookId: prevBook.id,
        prevBookTitle: prevBook.title,
      };
    } else {
      return { success: true, prevBookId: null };
    }
  } catch (error) {
    console.error("Failed to get previous book:", error);
    return { success: false, error: (error as Error).message };
  }
};

export const handleGetRandomBook = async (filter: FilterParams | null) => {
  try {
    const mainQuery = buildFilteredQuery(filter);

    const viewerExcludeCompleted = configStore.get("viewerExcludeCompleted");
    if (viewerExcludeCompleted) {
      mainQuery.where((builder) =>
        builder
          .whereNull("sub.page_count")
          .orWhere("sub.page_count", 0)
          .orWhereNull("sub.current_page")
          .orWhereRaw("sub.current_page < sub.page_count"),
      );
    }

    const randomBook = await mainQuery.orderByRaw("RANDOM()").first();
    if (randomBook) {
      return {
        success: true,
        bookId: randomBook.id,
        bookTitle: randomBook.title,
      };
    }
    return { success: false, error: "No books found in the library." };
  } catch (error) {
    console.error("Failed to get random book:", error);
    return { success: false, error };
  }
};

export const handleToggleBookFavorite = async ({
  bookId,
  isFavorite,
}: {
  bookId: number;
  isFavorite: boolean;
}) => {
  try {
    await db("Book").where("id", bookId).update({ is_favorite: isFavorite });
    return { success: true, is_favorite: isFavorite };
  } catch (error) {
    console.error(`Failed to toggle favorite for book ${bookId}:`, error);
    return { success: false, error };
  }
};

export const handleOpenBookFolder = async (bookPath: string) => {
  try {
    // shell.showItemInFolder는 파일 관리자에서 해당 항목을 보여줍니다.
    // 파일 경로를 제공하면 해당 파일이 선택(포커스)됩니다.
    shell.showItemInFolder(bookPath);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error showing item in folder ${bookPath}:`, error);
    return { success: false, error: message };
  }
};

export const handleAddBookHistory = async (bookId: number) => {
  try {
    // 읽음 기록 비활성화 시 건너뛰기
    if (!configStore.get("enableReadingHistory", true)) {
      return { success: true, skipped: true };
    }

    if (!bookId) {
      return { success: false, error: "Book ID is required." };
    }
    await db("BookHistory").insert({ book_id: bookId });
    return { success: true };
  } catch (error) {
    console.error(`Failed to add book history for book ${bookId}:`, error);
    return { success: false, error };
  }
};

export const handleCheckBookExistsByHitomiId = async (hitomiId: number) => {
  try {
    if (!hitomiId) {
      return { success: false, error: "Hitomi ID is required." };
    }
    const book = await db("Book")
      .where("hitomi_id", hitomiId.toString())
      .first();
    return { success: true, exists: !!book, bookId: book ? book.id : null };
  } catch (error) {
    console.error(
      `Failed to check book existence for hitomi_id ${hitomiId}:`,
      error,
    );
    return { success: false, error };
  }
};

export const handleGetBookHistory = async ({
  pageParam = 0,
  pageSize = 50,
}: {
  pageParam?: number;
  pageSize?: number;
}) => {
  try {
    const historyQuery = db("BookHistory")
      .select(
        "BookHistory.id as history_id",
        "BookHistory.viewed_at",
        "Book.id",
        "Book.title",
        "Book.cover_path",
      )
      .join("Book", "BookHistory.book_id", "Book.id")
      .orderBy("BookHistory.viewed_at", "desc");

    const totalCountQuery = db("BookHistory").count("* as count").first();
    const totalHistory = await totalCountQuery;

    historyQuery.offset(pageParam * pageSize).limit(pageSize);

    const history = await historyQuery;

    return {
      data: history,
      hasNextPage:
        (pageParam + 1) * pageSize < Number(totalHistory?.count || 0),
      nextPage: pageParam + 1,
    };
  } catch (error) {
    console.error("[Main] Failed to get book history:", error);
    return {
      success: false,
      error: (error as Error).message || "Unknown error",
    };
  }
};

export const handleDeleteBookHistory = async (historyId: number) => {
  try {
    await db.transaction(async (trx) => {
      const historyEntry = await trx("BookHistory")
        .where("id", historyId)
        .first();
      if (!historyEntry) {
        return; // Or throw an error
      }

      const bookId = historyEntry.book_id;

      // Delete the specific history entry
      await trx("BookHistory").where("id", historyId).del();

      // Find the new latest history entry for the book
      const latestHistory = await trx("BookHistory")
        .where("book_id", bookId)
        .orderBy("viewed_at", "desc")
        .first();

      // Update the book's last_read_at
      await trx("Book")
        .where("id", bookId)
        .update({
          last_read_at: latestHistory ? latestHistory.viewed_at : null,
        });
    });

    return { success: true };
  } catch (error) {
    console.error(`[Main] Failed to delete book history ${historyId}:`, error);
    return {
      success: false,
      error: (error as Error).message || "Unknown error",
    };
  }
};

export const handleClearBookHistory = async () => {
  try {
    await db.transaction(async (trx) => {
      await trx("BookHistory").del();
      await trx("Book").update({ last_read_at: null });
    });
    return { success: true };
  } catch (error) {
    console.error("[Main] Failed to clear book history:", error);
    return {
      success: false,
      error: (error as Error).message || "Unknown error",
    };
  }
};

export const handleDeleteBook = async (
  bookId: number,
  options?: { permanent?: boolean },
) => {
  try {
    const book = await db("Book").where("id", bookId).first();

    if (!book) {
      return { success: false, error: "Book not found." };
    }

    // 실제 파일/폴더 삭제 — 기본은 휴지통 이동, permanent 옵션 시 영구 삭제.
    // 휴지통 이동 실패 시 DB 레코드를 보존해야 하므로 파일 삭제를 먼저 수행한다.
    if (book.path) {
      try {
        const stats = await fs.stat(book.path);
        if (options?.permanent) {
          if (stats.isDirectory()) {
            await fs.rm(book.path, { recursive: true, force: true });
          } else if (stats.isFile()) {
            await fs.unlink(book.path);
          }
        } else {
          await shell.trashItem(book.path);
        }
      } catch (fileError) {
        const code = (fileError as NodeJS.ErrnoException).code;
        // 파일이 이미 없으면(ENOENT) 정상 진행 — DB만 정리
        if (code !== "ENOENT") {
          // 파일 삭제 실패(영구/휴지통 공통): DB 레코드를 보존하고 실패 반환.
          // 파일과 DB가 항상 함께 유지되거나 함께 삭제되도록 일관성을 보장한다.
          const action = options?.permanent ? "영구 삭제" : "휴지통으로 이동";
          console.error(
            `[Main] Failed to delete physical file/folder ${book.path}:`,
            fileError,
          );
          return {
            success: false,
            error: `파일을 ${action}하지 못했습니다.`,
          };
        }
      }
    }

    await db.transaction(async (trx) => {
      // 연관 테이블 먼저 삭제
      await trx("BookArtist").where("book_id", bookId).del();
      await trx("BookTag").where("book_id", bookId).del();
      await trx("BookSeries").where("book_id", bookId).del();
      await trx("BookGroup").where("book_id", bookId).del();
      await trx("BookCharacter").where("book_id", bookId).del();
      await trx("BookHistory").where("book_id", bookId).del();

      // 마지막으로 책 레코드 삭제
      await trx("Book").where("id", bookId).del();
    });

    // 썸네일은 캐시 파일이므로 즉시 삭제 (플레이스홀더 제외)
    if (
      book.cover_path &&
      !book.cover_path.startsWith("https://via.placeholder.com")
    ) {
      try {
        await fs.unlink(book.cover_path);
      } catch {
        // ENOENT는 무시 (이미 삭제됨)
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`[Main] Failed to delete book ${bookId}:`, error);
    return {
      success: false,
      error: (error as Error).message || "Unknown error",
    };
  }
};

export function registerBookHandlers() {
  ipcMain.handle("get-books", (_event, params) => handleGetBooks(params));
  ipcMain.handle("get-book", (_event, bookId) => handleGetBook(bookId));
  ipcMain.handle("get-tags", (_event) => handleGetTags());
  ipcMain.handle("get-artists", (_event) => handleGetArtists());
  ipcMain.handle("get-series", (_event) => handleGetSeries());
  ipcMain.handle("get-groups", (_event) => handleGetGroups());
  ipcMain.handle("get-characters", (_event) => handleGetCharacters());
  ipcMain.handle("get-types", (_event) => handleGetTypes());
  ipcMain.handle("get-languages", (_event) => handleGetLanguages());
  ipcMain.handle("get-book-page-paths", (_event, bookId) =>
    handleGetBookPagePaths(bookId),
  );
  ipcMain.handle("update-book-current-page", (_event, params) =>
    handleUpdateBookCurrentPage(params),
  );
  ipcMain.handle("get-book-current-page", (_event, bookId) =>
    handleGetBookCurrentPage(bookId),
  );
  ipcMain.handle("get-library-folder-stats", (_event, folderPath) =>
    handleGetLibraryFolderStats(folderPath),
  );
  ipcMain.handle("get-next-book", (_event, params) =>
    handleGetNextBook(params),
  );
  ipcMain.handle("get-prev-book", (_event, params) =>
    handleGetPrevBook(params),
  );
  ipcMain.handle("get-random-book", (_event, filter) =>
    handleGetRandomBook(filter),
  );
  ipcMain.handle("toggle-book-favorite", (_event, params) =>
    handleToggleBookFavorite(params),
  );
  ipcMain.handle("open-book-folder", (_event, bookPath) =>
    handleOpenBookFolder(bookPath),
  );
  ipcMain.handle("add-book-history", (_event, bookId) =>
    handleAddBookHistory(bookId),
  );
  ipcMain.handle("check-book-exists-by-hitomi-id", (_event, hitomiId) =>
    handleCheckBookExistsByHitomiId(hitomiId),
  );
  ipcMain.handle("delete-book", (_event, bookId) => handleDeleteBook(bookId));
  ipcMain.handle("get-book-history", (_event, params) =>
    handleGetBookHistory(params),
  );
  ipcMain.handle("delete-book-history", (_event, historyId) =>
    handleDeleteBookHistory(historyId),
  );
  ipcMain.handle("clear-book-history", () => handleClearBookHistory());
}
