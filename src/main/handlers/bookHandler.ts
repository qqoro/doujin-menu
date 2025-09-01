import { ipcMain, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import * as yauzl from "yauzl";
import db from "../db/index.js";
import { naturalSort } from "../utils/index.js";
import { store as configStore } from "./configHandler.js";

interface FilterParams {
  searchQuery?: string;
  libraryPath?: string;
  readStatus?: "all" | "read" | "unread";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isFavorite?: boolean;
}

function buildFilteredQuery(filter: FilterParams | null) {
  const {
    searchQuery = "",
    readStatus = "all",
    isFavorite = false,
    libraryPath = "",
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
    const lowerCaseQuery = searchQuery.toLowerCase();
    const titleTerms: string[] = [];
    const idTerms: string[] = [];
    const artistTerms: string[] = [];
    const tagTerms: string[] = [];
    const seriesTerms: string[] = [];
    const groupTerms: string[] = [];
    const typeTerms: string[] = [];
    const languageTerms: string[] = [];
    const characterTerms: string[] = [];

    const prefixedTermRegex =
      /(id|artist|group|type|language|series|character|tag):(.+?)(?=\s*(?:id|artist|group|type|language|series|character|tag|male|female):|$)/g;

    let lastIndex = 0;
    let match;

    while ((match = prefixedTermRegex.exec(lowerCaseQuery)) !== null) {
      const prefix = match[1];
      const value = match[2].trim();

      const leadingText = lowerCaseQuery
        .substring(lastIndex, match.index)
        .trim();
      if (leadingText) {
        titleTerms.push(...leadingText.split(" ").filter((t) => t.length > 0));
      }

      switch (prefix) {
        case "id":
          idTerms.push(value);
          break;
        case "artist":
          artistTerms.push(value);
          break;
        case "group":
          groupTerms.push(value);
          break;
        case "type":
          typeTerms.push(value);
          break;
        case "language":
          languageTerms.push(value);
          break;
        case "series":
          seriesTerms.push(value);
          break;
        case "character":
          characterTerms.push(value);
          break;
        case "tag":
          tagTerms.push(value);
          break;
      }
      lastIndex = prefixedTermRegex.lastIndex;
    }

    const remainingText = lowerCaseQuery.substring(lastIndex).trim();
    if (remainingText) {
      titleTerms.push(...remainingText.split(" ").filter((t) => t.length > 0));
    }

    const unhandledTerms = [...titleTerms];
    titleTerms.length = 0;
    for (const term of unhandledTerms) {
      if (term.startsWith("male:") || term.startsWith("female:")) {
        tagTerms.push(term);
      } else {
        titleTerms.push(term);
      }
    }

    if (idTerms.length > 0) {
      mainQuery.whereIn("sub.hitomi_id", idTerms);
    }
    if (artistTerms.length > 0) {
      for (const artist of artistTerms) {
        mainQuery.whereRaw("LOWER(sub.artists) LIKE ?", [`%${artist}%`]);
      }
    }
    if (groupTerms.length > 0) {
      for (const group of groupTerms) {
        mainQuery.whereRaw("LOWER(sub.groups) LIKE ?", [`%${group}%`]);
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
        mainQuery.whereRaw("LOWER(sub.characters) LIKE ?", [`%${character}%`]);
      }
    }
    if (tagTerms.length > 0) {
      for (const tag of tagTerms) {
        mainQuery.whereRaw("LOWER(sub.tags) LIKE ?", [`%${tag}%`]);
      }
    }
    if (seriesTerms.length > 0) {
      for (const seriesName of seriesTerms) {
        mainQuery.whereRaw("LOWER(sub.series) LIKE ?", [`%${seriesName}%`]);
      }
    }
    if (titleTerms.length > 0) {
      for (const titleTerm of titleTerms) {
        mainQuery.whereRaw("LOWER(sub.title) LIKE ?", [`%${titleTerm}%`]);
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
  if (sortBy === "hitomi_id") {
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

  const formattedBooks = books.map((book) => {
    let displayTitle = book.title;
    if (prioritizeKoreanTitles) {
      const koreanPart = /^.+\|\s?([가-힇a-z\d\s]+)$/i.exec(book.title);
      if (koreanPart?.[1]) {
        displayTitle = koreanPart[1].trim();
      }
    }

    return {
      ...book,
      title: displayTitle,
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
  });

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

  let displayTitle = book.title;
  if (prioritizeKoreanTitles) {
    const koreanPart = /^.+\|\s?([가-힇a-z\d\s]+)$/i.exec(book.title);
    if (koreanPart?.[1]) {
      displayTitle = koreanPart[1].trim();
    }
  }

  return {
    ...book,
    title: displayTitle,
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
      console.log(
        `[Main] Found ${pagePaths.length} pages for folder book ${bookId}`,
      );
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
              console.log(
                `[Main] Found ${pagePaths.length} pages for zip book ${bookId}`,
              );
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

    if (mode === "random") {
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
    const { sortBy = "added_at", sortOrder = "desc" } = filter || {};
    const currentBook = await db("Book").where("id", currentBookId).first();
    if (!currentBook) {
      return { success: false, error: "Current book not found" };
    }

    if (sortBy === "hitomi_id") {
      const sortValue = Number(currentBook.hitomi_id);
      if (sortOrder === "desc") {
        mainQuery.where((builder) =>
          builder
            .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "<", sortValue)
            .orWhere((b) =>
              b
                .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "=", sortValue)
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
                .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "=", sortValue)
                .where("sub.id", ">", currentBookId),
            ),
        );
        mainQuery.orderByRaw("CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC");
      }
    } else {
      const sortColumn = `sub.${sortBy}`;
      const sortValue = currentBook[sortBy];
      if (sortOrder === "desc") {
        mainQuery.where((builder) =>
          builder
            .where(sortColumn, "<", sortValue)
            .orWhere((b) =>
              b
                .where(sortColumn, "=", sortValue)
                .where("sub.id", "<", currentBookId),
            ),
        );
        mainQuery.orderBy(sortColumn, "desc").orderBy("sub.id", "desc");
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

    const currentBook = await db("Book").where("id", currentBookId).first();
    if (!currentBook) {
      return { success: false, error: "Current book not found" };
    }

    if (sortBy === "hitomi_id") {
      const sortValue = Number(currentBook.hitomi_id);
      if (sortOrder === "desc") {
        mainQuery.where((builder) =>
          builder
            .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), ">", sortValue)
            .orWhere((b) =>
              b
                .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "=", sortValue)
                .where("sub.id", ">", currentBookId),
            ),
        );
        mainQuery.orderByRaw("CAST(sub.hitomi_id AS INTEGER) ASC, sub.id ASC");
      } else {
        mainQuery.where((builder) =>
          builder
            .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "<", sortValue)
            .orWhere((b) =>
              b
                .where(db.raw("CAST(sub.hitomi_id AS INTEGER)"), "=", sortValue)
                .where("sub.id", "<", currentBookId),
            ),
        );
        mainQuery.orderByRaw(
          "CAST(sub.hitomi_id AS INTEGER) DESC, sub.id DESC",
        );
      }
    } else {
      const sortColumn = `sub.${sortBy}`;
      const sortValue = currentBook[sortBy];
      if (sortOrder === "desc") {
        mainQuery.where((builder) =>
          builder
            .where(sortColumn, ">", sortValue)
            .orWhere((b) =>
              b
                .where(sortColumn, "=", sortValue)
                .where("sub.id", ">", currentBookId),
            ),
        );
        mainQuery.orderBy(sortColumn, "asc").orderBy("sub.id", "asc");
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

export const handleToggleBookFavorite = async (
  bookId: number,
  isFavorite: boolean,
) => {
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
    return { success: true, exists: !!book };
  } catch (error) {
    console.error(
      `Failed to check book existence for hitomi_id ${hitomiId}:`,
      error,
    );
    return { success: false, error };
  }
};

export const handleDeleteBook = async (bookId: number) => {
  try {
    const book = await db("Book").where("id", bookId).first();

    if (!book) {
      return { success: false, error: "Book not found." };
    }

    await db.transaction(async (trx) => {
      // Delete from related tables first
      await trx("BookArtist").where("book_id", bookId).del();
      await trx("BookTag").where("book_id", bookId).del();
      await trx("BookSeries").where("book_id", bookId).del();
      await trx("BookGroup").where("book_id", bookId).del();
      await trx("BookCharacter").where("book_id", bookId).del();
      await trx("BookHistory").where("book_id", bookId).del();

      // Finally, delete the book itself
      await trx("Book").where("id", bookId).del();
    });

    // Delete physical file/folder
    if (book.path) {
      try {
        const stats = await fs.stat(book.path);
        if (stats.isDirectory()) {
          await fs.rm(book.path, { recursive: true, force: true });
          console.log(`[Main] Deleted directory: ${book.path}`);
        } else if (stats.isFile()) {
          await fs.unlink(book.path);
          console.log(`[Main] Deleted file: ${book.path}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (fileError: any) {
        if (fileError.code === "ENOENT") {
          console.warn(
            `[Main] Book file/folder not found, skipping deletion: ${book.path}`,
          );
        } else {
          console.error(
            `[Main] Failed to delete physical file/folder ${book.path}:`,
            fileError,
          );
          // Do not re-throw, as DB deletion was successful
        }
      }
    }

    // Delete thumbnail file if it exists and is not a placeholder
    if (
      book.cover_path &&
      !book.cover_path.startsWith("https://via.placeholder.com")
    ) {
      try {
        await fs.unlink(book.cover_path);
        console.log(`[Main] Deleted thumbnail: ${book.cover_path}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (thumbError: any) {
        if (thumbError.code === "ENOENT") {
          console.warn(
            `[Main] Thumbnail file not found, skipping deletion: ${book.cover_path}`,
          );
        }
      } finally {
        // Do not re-throw
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
  ipcMain.handle("toggle-book-favorite", (_event, bookId, isFavorite) =>
    handleToggleBookFavorite(bookId, isFavorite),
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
}
