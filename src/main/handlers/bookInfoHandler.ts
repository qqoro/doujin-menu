import { ipcMain } from "electron";
import fs from "fs/promises";
import db from "../db/index.js";
import { console } from "../main.js";
import { formatInfoContent, toInfoFields } from "../parsers/infoTxtFormat.js";
import { parseInfoTxt } from "../parsers/infoTxtParser.js";
import {
  isArchivePath,
  resolveInfoWriteTarget,
} from "../services/bookInfo/infoFile.js";
import type { BookInfoFields, BookInfoFile } from "../../types/ipc.js";
import {
  extractInfoTxtAndImageCountFromZip,
  scanFile,
} from "./directoryHandler.js";

const RELATIONS = [
  { key: "artists", table: "Artist", join: "BookArtist", fk: "artist_id" },
  { key: "groups", table: "Group", join: "BookGroup", fk: "group_id" },
  { key: "series", table: "Series", join: "BookSeries", fk: "series_id" },
  {
    key: "characters",
    table: "Character",
    join: "BookCharacter",
    fk: "character_id",
  },
  { key: "tags", table: "Tag", join: "BookTag", fk: "tag_id" },
] as const;

/** info 파일이 아예 없는 책은 스캔이 DB에 남긴 값으로 창을 채운다 */
async function fieldsFromDb(book: {
  id: number;
  title: string;
  hitomi_id: string | null;
  type: string | null;
  language_name_local: string | null;
}): Promise<BookInfoFields> {
  const fields: BookInfoFields = {
    hitomi_id: book.hitomi_id,
    title: book.title,
    artists: [],
    groups: [],
    type: book.type,
    series: [],
    characters: [],
    tags: [],
    language: book.language_name_local,
  };
  for (const { key, table, join, fk } of RELATIONS) {
    fields[key] = await db(join)
      .join(table, `${table}.id`, `${join}.${fk}`)
      .where(`${join}.book_id`, book.id)
      .pluck(`${table}.name`);
  }
  return fields;
}

export const handleGetBookInfoFile = async (
  bookId: number,
): Promise<{ success: boolean; data?: BookInfoFile; error?: string }> => {
  try {
    const book = await db("Book").where("id", bookId).first();
    if (!book) return { success: false, error: "책을 찾을 수 없습니다." };

    const isArchive = isArchivePath(book.path);
    const target = await resolveInfoWriteTarget(book.path);

    let content: string | null = null;
    if (target.exists) {
      content = await fs.readFile(target.path, "utf-8");
    } else if (isArchive) {
      content = (await extractInfoTxtAndImageCountFromZip(book.path)).infoTxt;
    }

    const parsed = content ? parseInfoTxt(content) : {};
    const fields =
      Object.keys(parsed).length > 0
        ? toInfoFields(parsed)
        : await fieldsFromDb(book);

    return {
      success: true,
      data: {
        fields,
        targetPath: target.path,
        targetExists: target.exists,
        isArchive,
      },
    };
  } catch (error) {
    console.error(`[Main] info 파일 조회 오류 (ID: ${bookId}):`, error);
    return { success: false, error: (error as Error).message };
  }
};

/** 파서와 같은 규칙으로 이름을 다듬는다. 공백은 `_`, 빈 이름과 중복은 뺀다 */
const normalizeNames = (names: string[]) => [
  ...new Set(
    names.map((name) => name.trim().replace(/\s+/g, "_")).filter(Boolean),
  ),
];

export const normalizeInfoFields = (
  fields: BookInfoFields,
): BookInfoFields => ({
  hitomi_id: fields.hitomi_id?.trim() || null,
  title: fields.title.trim(),
  artists: normalizeNames(fields.artists),
  groups: normalizeNames(fields.groups),
  type: fields.type?.trim() || null,
  series: normalizeNames(fields.series),
  characters: normalizeNames(fields.characters),
  tags: normalizeNames(fields.tags),
  language: fields.language?.trim() || null,
});

export const handleSaveBookInfoFile = async ({
  bookId,
  fields,
}: {
  bookId: number;
  fields: BookInfoFields;
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const book = await db("Book").where("id", bookId).first();
    if (!book) return { success: false, error: "책을 찾을 수 없습니다." };
    if (book.is_offline) {
      return {
        success: false,
        error: "라이브러리 폴더에 접근할 수 없어 저장할 수 없습니다.",
      };
    }

    const normalized = normalizeInfoFields(fields);
    if (!normalized.title) {
      return { success: false, error: "제목을 입력해 주세요." };
    }
    if (normalized.hitomi_id && !/^\d+$/.test(normalized.hitomi_id)) {
      return {
        success: false,
        error: "갤러리 넘버는 숫자만 입력할 수 있습니다.",
      };
    }

    const target = await resolveInfoWriteTarget(book.path);
    await fs.writeFile(target.path, formatInfoContent(normalized), "utf-8");
    await scanFile(book.path);
    return { success: true };
  } catch (error) {
    console.error(`[Main] info 파일 저장 오류 (ID: ${bookId}):`, error);
    return { success: false, error: (error as Error).message };
  }
};

export function registerBookInfoHandlers() {
  ipcMain.handle("get-book-info-file", (_event, bookId: number) =>
    handleGetBookInfoFile(bookId),
  );
  ipcMain.handle("save-book-info-file", (_event, payload) =>
    handleSaveBookInfoFile(payload),
  );
}
