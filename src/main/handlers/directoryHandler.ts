import { BrowserWindow, app, dialog, ipcMain } from "electron";
import * as fsSync from "fs";
import fs from "fs/promises";
import os from "os"; // os 모듈 임포트
import PQueue from "p-queue"; // p-queue 임포트
import path from "path";
import yauzl from "yauzl";
import db from "../db/index.js";
import { Book } from "../db/types.js";
import { console } from "../main.js";
import { ParsedMetadata, parseInfoTxt } from "../parsers/infoTxtParser.js";
import { generateThumbnailForBook } from "./thumbnailHandler.js"; // 썸네일 생성 함수 임포트

function cleanValue(value: string | null | undefined): string | null {
  if (value === "N/A" || value === undefined || value === null) {
    return null;
  }
  return value;
}

export async function extractCoverFromZip(
  zipPath: string,
  outputPath: string,
): Promise<string | null> {
  console.log(
    `[Main] Attempting to extract cover from ZIP: ${zipPath} to ${outputPath}`,
  );
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error(`[Main] Error opening ZIP file ${zipPath}:`, err);
        return reject(err);
      }

      let foundImageAndStartedExtraction = false; // 이미지를 찾고 추출을 시작했는지 여부 플래그

      zipfile.readEntry(); // 엔트리 읽기 시작

      zipfile.on("entry", (entry) => {
        const isImage = entry.fileName.match(/\.(jpg|jpeg|png|webp)$/i);

        if (isImage && !foundImageAndStartedExtraction) {
          foundImageAndStartedExtraction = true; // 플래그 설정
          // 첫 번째 이미지 파일을 찾으면 바로 추출 시작
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error(
                `[Main] Error reading entry from ZIP ${entry.fileName}:`,
                err,
              );
              zipfile.close(); // 오류 발생 시 파일 닫기
              return reject(err);
            }
            const writeStream = fsSync.createWriteStream(outputPath);
            readStream.pipe(writeStream);
            writeStream.on("finish", () => {
              console.log(
                `[Main] Successfully extracted cover from ZIP to: ${outputPath} (from ${entry.fileName})`,
              );
              zipfile.close(); // 추출 완료 후 파일 닫기
              resolve(outputPath);
            });
            writeStream.on("error", (writeErr) => {
              console.error(
                `[Main] Error writing extracted ZIP cover to ${outputPath}:`,
                writeErr,
              );
              zipfile.close(); // 오류 발생 시 파일 닫기
              reject(writeErr);
            });
          });
        } else {
          // 이미지를 찾지 못했거나 이미 추출을 시작한 경우 다음 엔트리 읽기
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        // 모든 엔트리를 스캔했지만 적합한 커버 이미지를 찾지 못한 경우
        if (!foundImageAndStartedExtraction) {
          console.log(
            `[Main] Finished scanning ZIP entries for ${zipPath}. No suitable cover image found.`,
          );
          zipfile.close(); // 파일 닫기
          resolve(null);
        }
      });

      zipfile.on("error", (zipErr) => {
        console.error(
          `[Main] Error during ZIP file processing ${zipPath}:`,
          zipErr,
        );
        zipfile.close(); // 오류 발생 시 파일 닫기
        reject(zipErr);
      });
    });
  });
}

export async function extractInfoTxtFromZip(
  zipPath: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error(
          `[Main] Error opening ZIP file for info.txt ${zipPath}:`,
          err,
        );
        return resolve(null);
      }
      zipfile.on("entry", (entry) => {
        if (entry.fileName === "info.txt") {
          console.log(`[Main] Found info.txt inside ZIP: ${zipPath}`);
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error(
                `[Main] Error reading info.txt from ZIP ${zipPath}:`,
                err,
              );
              return resolve(null);
            }
            let fileContent = "";
            readStream.on("data", (chunk) => (fileContent += chunk.toString()));
            readStream.on("end", () => {
              console.log(
                `[Main] Successfully extracted info.txt content from ZIP: ${zipPath}`,
              );
              resolve(fileContent);
            });
            readStream.on("error", (readErr) => {
              console.error(
                `[Main] Error reading info.txt stream from ZIP ${zipPath}:`,
                readErr,
              );
              resolve(null);
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on("end", () => {
        console.log(
          `[Main] Finished scanning ZIP entries for info.txt in ${zipPath}. info.txt not found.`,
        );
        resolve(null);
      });
      zipfile.on("error", (zipErr) => {
        console.error(
          `[Main] Error during ZIP file processing for info.txt ${zipPath}:`,
          zipErr,
        );
        resolve(null);
      });
      zipfile.readEntry(); // Start reading entries
    });
  });
}

export async function getImageCountInZip(zipPath: string): Promise<number> {
  return new Promise((resolve) => {
    let imageCount = 0;
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error(
          `[Main] Error opening ZIP file for image count ${zipPath}:`,
          err,
        );
        return resolve(0);
      }
      zipfile.on("entry", (entry) => {
        if (entry.fileName.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)) {
          imageCount++;
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        resolve(imageCount);
      });
      zipfile.on("error", (zipErr) => {
        console.error(
          `[Main] Error during ZIP file processing for image count ${zipPath}:`,
          zipErr,
        );
        resolve(0);
      });
      zipfile.readEntry(); // Start reading entries
    });
  });
}

export const handleAddBooksFromDirectory = async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (!filePaths || filePaths.length === 0) {
    return;
  }

  const directoryPath = filePaths[0];
  const { added, updated, deleted } = await scanDirectory(directoryPath);
  console.log(
    `[Main] Initial scan complete for ${directoryPath}: Added ${added}, Updated ${updated}, Deleted ${deleted}`,
  );
};

export const handleSelectFolder = async () => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (filePaths && filePaths.length > 0) {
    return { success: true, path: filePaths[0] };
  } else {
    return { success: false };
  }
};

async function processBookItem(
  itemPath: string,
  {
    isDirectory,
    isFile,
    name,
  }: { isDirectory: boolean; isFile: boolean; name: string },
) {
  console.log(
    `[Main] processBookItem called for: ${itemPath}, isDirectory: ${isDirectory}, isFile: ${isFile}`,
  );
  let bookData: Book | null = null;
  let coverPath: string | null = null;
  let infoMetadata: ParsedMetadata = {};

  const infoTxtPath = path.join(itemPath, "info.txt");
  const parentInfoTxtPath = path.join(
    path.dirname(itemPath),
    `${name}.info.txt`,
  );

  try {
    const stats = await fs.stat(infoTxtPath);
    if (stats.isFile()) {
      infoMetadata = parseInfoTxt(await fs.readFile(infoTxtPath, "utf-8"));
      console.log(
        `[Main] Found and parsed info.txt for ${name}:`,
        infoMetadata,
      );
    }
  } catch {
    // info.txt 파일이 없거나 읽을 수 없는 경우 무시
  }

  if (Object.keys(infoMetadata).length === 0) {
    try {
      const stats = await fs.stat(parentInfoTxtPath);
      if (stats.isFile()) {
        infoMetadata = parseInfoTxt(
          await fs.readFile(parentInfoTxtPath, "utf-8"),
        );
        console.log(
          `[Main] Found and parsed external info.txt for ${name}:`,
          infoMetadata,
        );
      }
    } catch {
      // 외부 info.txt 파일이 없거나 읽을 수 없는 경우 무시
    }
  }

  if (isFile) {
    const ext = path.extname(name).toLowerCase();
    if (ext === ".cbz" || ext === ".zip") {
      console.log(`[Main] Processing ZIP file: ${itemPath}`);
      const infoTxtContent = await extractInfoTxtFromZip(itemPath);
      if (infoTxtContent) {
        infoMetadata = parseInfoTxt(infoTxtContent);
        console.log(
          `[Main] Found and parsed info.txt from ZIP for ${name}:`,
          infoMetadata,
        );
      }
    }
  }

  if (isDirectory) {
    const imageFiles = (await fs.readdir(itemPath))
      .filter((f) => RegExp(/\.(jpg|jpeg|png|webp)$/i).exec(f))
      .sort();
    if (imageFiles.length > 0) {
      bookData = {
        title: cleanValue(infoMetadata.title) || name,
        path: itemPath,
        page_count: imageFiles.length,
        // @ts-expect-error string은 아니나 DB 삽입 시 정상 데이터
        added_at: db.fn.now(),
        hitomi_id: cleanValue(infoMetadata.hitomi_id) || null,
        type: cleanValue(infoMetadata.type) || null,
        language_name_local: cleanValue(infoMetadata.language) || null,
      };
      coverPath = path.join(itemPath, imageFiles[0]);
    }
  } else if (isFile) {
    const ext = path.extname(name).toLowerCase();
    if (ext === ".cbz" || ext === ".zip") {
      const pageCount = await getImageCountInZip(itemPath); // 이미지 개수 먼저 가져옴
      if (pageCount > 0) {
        // 이미지가 1개 이상일 때만 bookData 할당
        bookData = {
          title: cleanValue(infoMetadata.title) || path.basename(name, ext),
          path: itemPath,
          page_count: pageCount, // 가져온 pageCount 사용
          // @ts-expect-error string은 아니나 DB 삽입 시 정상 데이터
          added_at: db.fn.now(),
          hitomi_id: cleanValue(infoMetadata.hitomi_id) || null,
          type: cleanValue(infoMetadata.type) || null,
          language_name_local: cleanValue(infoMetadata.language) || null,
        };
        const tempCoverPath = path.join(
          app.getPath("temp"),
          `${bookData!.title}.webp`,
        );
        coverPath = await extractCoverFromZip(itemPath, tempCoverPath);
      } else {
        console.log(
          `[Main] Skipping ZIP file ${itemPath} as no images were found.`,
        );
      }
    }
  }

  if (bookData) {
    if (Object.keys(infoMetadata).length > 0) {
      bookData.title = cleanValue(infoMetadata.title) || bookData.title;
      bookData.hitomi_id =
        cleanValue(infoMetadata.hitomi_id) || bookData.hitomi_id;
      bookData.type = cleanValue(infoMetadata.type) || bookData.type;
      bookData.language_name_local =
        cleanValue(infoMetadata.language) || bookData.language_name_local;
    }

    return {
      bookData,
      infoMetadata,
      coverPath,
    };
  }
  console.log(`[Main] processBookItem returning null for: ${itemPath}`);
  return null;
}

export async function scanDirectory(
  directoryPath: string,
  currentDepth = 0,
): Promise<{
  added: number;
  updated: number;
  deleted: number;
  foundPaths: Set<string>;
  bookIdsToGenerateThumbnails: number[];
  processedBooks: { bookData: Book; infoMetadata: ParsedMetadata; coverPath: string | null; }[]; // 추가된 반환 값
}> {
  const MAX_SCAN_DEPTH = 100;
  if (currentDepth > MAX_SCAN_DEPTH) {
    console.warn(
      `[Main] Max scan depth (${MAX_SCAN_DEPTH}) exceeded for directory: ${directoryPath}`,
    );
    return {
      added: 0,
      updated: 0,
      deleted: 0,
      foundPaths: new Set(),
      bookIdsToGenerateThumbnails: [],
      processedBooks: [], // 추가된 반환 값
    };
  }
  console.log(`[Main] Scanning directory: ${directoryPath}`);

  let processedBooks: {
    bookData: Book;
    infoMetadata: ParsedMetadata;
    coverPath: string | null;
  }[] = []; // let으로 변경 및 초기화
  const totalFoundBookPathsInScan = new Set<string>();

  try {
    const items = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(directoryPath, item.name);
      const ext = path.extname(item.name).toLowerCase();

      if (item.isDirectory()) {
        const bookResult = await processBookItem(itemPath, {
          isDirectory: true,
          isFile: false,
          name: item.name,
        });

        if (bookResult) {
          processedBooks.push(bookResult);
          totalFoundBookPathsInScan.add(bookResult.bookData.path);
        } else {
          const subScanResult = await scanDirectory(itemPath, currentDepth + 1);
          subScanResult.foundPaths.forEach((p) =>
            totalFoundBookPathsInScan.add(p),
          );
          processedBooks.push(...subScanResult.processedBooks); // 하위 스캔 결과 병합
        }
      } else if (item.isFile() && (ext === ".cbz" || ext === ".zip")) {
        const bookResult = await processBookItem(itemPath, {
          isDirectory: false,
          isFile: true,
          name: item.name,
        });

        if (bookResult) {
          processedBooks.push(bookResult);
          totalFoundBookPathsInScan.add(bookResult.bookData.path);
        }
      }
    }

    // 최상위 스캔(currentDepth === 0)에서만 DB 작업을 수행
    // 또는 scanDirectory를 직접 호출하는 경우(더 이상 parentTrx 개념 없음)
    if (currentDepth === 0) {
      let totalAddedCount = 0;
      let totalUpdatedCount = 0;
      let totalDeletedCount = 0;
      const bookIdsToGenerateThumbnails: number[] = [];

      await db.transaction(async (trx) => {
        const existingBooksInDb = await trx("Book")
          .select("id", "path", "cover_path")
          .where("path", "like", `${directoryPath}%`);

        // 삭제할 책 식별
        const booksToDelete = existingBooksInDb.filter(
          (book) => !totalFoundBookPathsInScan.has(book.path),
        );

        for (const book of booksToDelete) {
          console.log(`[Main] Deleting book from DB: ${book.path}`);
          await trx("BookArtist").where("book_id", book.id).del();
          await trx("BookTag").where("book_id", book.id).del();
          await trx("BookSeries").where("book_id", book.id).del();
          await trx("BookGroup").where("book_id", book.id).del();
          await trx("BookCharacter").where("book_id", book.id).del();
          await trx("Book").where("id", book.id).del();
          totalDeletedCount++;

          if (book.cover_path) {
            try {
              await fs.unlink(book.cover_path);
              console.log(`[Main] Deleted thumbnail file: ${book.cover_path}`);
            } catch (e) {
              console.error(
                `[Main] Failed to delete thumbnail file ${book.cover_path}:`,
                e,
              );
            }
          }
        }

        // 수집된 책 처리 (삽입/업데이트)
        for (const processedBook of processedBooks) {
          const { bookData, infoMetadata, coverPath } = processedBook;
          const existingBook = existingBooksInDb.find(
            (b) => b.path === bookData.path,
          );

          let bookId: number;
          if (existingBook) {
            bookId = existingBook.id;
            await trx("Book")
              .where("id", bookId)
              .update({
                title: cleanValue(bookData.title),
                page_count: bookData.page_count,
                hitomi_id: cleanValue(bookData.hitomi_id),
                type: cleanValue(bookData.type),
                language_name_english: cleanValue(
                  bookData.language_name_english,
                ),
                language_name_local: cleanValue(bookData.language_name_local),
              });
            console.log(
              `[Main] 기존 책 정보 업데이트. ID: ${bookId}, Title: ${bookData.title}`,
            );
            totalUpdatedCount++;

            // 업데이트를 위해 기존 연결 제거
            await trx("BookArtist").where("book_id", bookId).del();
            await trx("BookTag").where("book_id", bookId).del();
            await trx("BookSeries").where("book_id", bookId).del();
            await trx("BookGroup").where("book_id", bookId).del();
            await trx("BookCharacter").where("book_id", bookId).del();
          } else {
            const bookToInsert = {
              title: cleanValue(bookData.title),
              path: bookData.path,
              page_count: bookData.page_count || 0,
              added_at: bookData.added_at,
              hitomi_id: cleanValue(bookData.hitomi_id),
              type: cleanValue(bookData.type),
              language_name_english: cleanValue(bookData.language_name_english),
              language_name_local: cleanValue(bookData.language_name_local),
            };
            const result = await trx("Book").insert(bookToInsert);
            bookId = result[0];
            console.log(
              `[Main] 새 책 추가. ID: ${bookId}, Title: ${bookData.title}`,
            );
            totalAddedCount++;
          }

          // 아티스트, 그룹, 캐릭터, 태그, 시리즈 처리
          const artistsToProcess =
            infoMetadata.artists
              ?.map((a) => cleanValue(a.name))
              .filter(Boolean) || [];
          for (const artistName of artistsToProcess) {
            let artist = await trx("Artist").where("name", artistName).first();
            if (!artist) {
              const [newArtistId] = await trx("Artist").insert({
                name: artistName,
              });
              artist = { id: newArtistId, name: artistName };
            }
            await trx("BookArtist").insert({
              book_id: bookId,
              artist_id: artist.id,
            });
          }

          const groupsToProcess =
            infoMetadata.groups
              ?.map((g) => cleanValue(g.name))
              .filter(Boolean) || [];
          for (const groupName of groupsToProcess) {
            let group = await trx("Group").where("name", groupName).first();
            if (!group) {
              const [newGroupId] = await trx("Group").insert({
                name: groupName,
              });
              group = { id: newGroupId, name: groupName };
            }
            await trx("BookGroup").insert({
              book_id: bookId,
              group_id: group.id,
            });
          }

          const charactersToProcess =
            infoMetadata.characters
              ?.map((c) => cleanValue(c.name))
              .filter(Boolean) || [];
          for (const characterName of charactersToProcess) {
            let character = await trx("Character")
              .where("name", characterName)
              .first();
            if (!character) {
              const [newCharacterId] = await trx("Character").insert({
                name: characterName,
              });
              character = { id: newCharacterId, name: characterName };
            }
            await trx("BookCharacter").insert({
              book_id: bookId,
              character_id: character.id,
            });
          }

          const tagsToProcess =
            infoMetadata.tags?.map((t) => cleanValue(t.name)).filter(Boolean) ||
            [];
          for (const tagName of tagsToProcess) {
            let tag = await trx("Tag").where("name", tagName).first();
            if (!tag) {
              const [newTagId] = await trx("Tag").insert({ name: tagName });
              tag = { id: newTagId, name: tagName };
            }
            await trx("BookTag").insert({ book_id: bookId, tag_id: tag.id });
          }

          if (infoMetadata.series && infoMetadata.series.length > 0) {
            const seriesName = infoMetadata.series[0].name;
            let series = await trx("Series").where("name", seriesName).first();
            if (!series) {
              const [newSeriesId] = await trx("Series").insert({
                name: seriesName,
              });
              series = { id: newSeriesId, name: seriesName };
            }
            await trx("BookSeries").insert({
              book_id: bookId,
              series_id: series.id,
            });
          }

          // 썸네일 생성 필요 여부 결정
          const currentBookInDb = existingBooksInDb.find(
            (b) => b.id === bookId,
          );
          let shouldGenerateThumbnail = false;
          if (coverPath) {
            if (!currentBookInDb?.cover_path) {
              shouldGenerateThumbnail = true;
            } else {
              try {
                await fs.access(currentBookInDb.cover_path);
              } catch {
                shouldGenerateThumbnail = true;
                console.warn(
                  `[Main] Existing thumbnail file not found for book ${bookId}. Regenerating.`,
                );
              }
            }
          }
          if (shouldGenerateThumbnail) {
            bookIdsToGenerateThumbnails.push(bookId);
          }
        }
      }); // End of db.transaction

      // 스캔 완료 후 썸네일 생성 일괄 트리거
      if (bookIdsToGenerateThumbnails.length > 0) {
        console.log(
          `[Main] Generating thumbnails for ${bookIdsToGenerateThumbnails.length} books after scan.`,
        );
        const queue = new PQueue({ concurrency: os.cpus().length });
        const updatedThumbnails: { bookId: number; thumbnailPath: string }[] =
          [];

        for (const bookId of bookIdsToGenerateThumbnails) {
          queue.add(async () => {
            const result = await generateThumbnailForBook(bookId);
            if (result) {
              updatedThumbnails.push(result);
            }
          });
        }
        await queue.onIdle();

        // 썸네일 경로 일괄 업데이트 (새로운 트랜잭션 필요 없음, 이미 커밋된 상태)
        await db.transaction(async (updateTrx) => {
          for (const { bookId, thumbnailPath } of updatedThumbnails) {
            await updateTrx("Book")
              .where("id", bookId)
              .update({ cover_path: thumbnailPath });
          }
        });
        console.log(
          `[Main] Finished generating and updating thumbnails after scan.`,
        );
      }

      return {
        added: totalAddedCount,
        updated: totalUpdatedCount,
        deleted: totalDeletedCount,
        foundPaths: totalFoundBookPathsInScan,
        bookIdsToGenerateThumbnails,
        processedBooks: processedBooks, // 추가된 반환 값
      };
    }
  } catch (error) {
    console.error(
      `[Main] Error during directory scan: ${directoryPath}`,
      error,
    );
    throw error; // 에러를 다시 던져 상위 호출자에게 알림
  }

  return {
    added: 0,
    updated: 0,
    deleted: 0,
    foundPaths: totalFoundBookPathsInScan,
    bookIdsToGenerateThumbnails: [],
    processedBooks: processedBooks, // 추가된 반환 값
  };
}

export async function scanFile(filePath: string) {
  console.log(`[Main] Scanning file: ${filePath}`);
  let addedCount = 0;
  let updatedCount = 0;

  try {
    const stats = await fs.stat(filePath);
    const processedBook = await processBookItem(filePath, {
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      name: path.basename(filePath),
    });

    if (processedBook) {
      const { bookData, infoMetadata, coverPath } = processedBook;
      let bookId: number | undefined;
      let shouldGenerateThumbnail = false;

      await db.transaction(async (trx) => {
        const existingBook = await trx("Book")
          .where("path", bookData.path)
          .first();

        if (existingBook) {
          bookId = existingBook.id;
          await trx("Book")
            .where("id", bookId)
            .update({
              title: cleanValue(bookData.title),
              page_count: bookData.page_count,
              hitomi_id: cleanValue(bookData.hitomi_id),
              type: cleanValue(bookData.type),
              language_name_english: cleanValue(bookData.language_name_english),
              language_name_local: cleanValue(bookData.language_name_local),
            });
          console.log(
            `[Main] 기존 책 정보 업데이트. ID: ${bookId}, Title: ${bookData.title}`,
          );
          updatedCount++;

          // 업데이트를 위해 기존 연결 제거
          await trx("BookArtist").where("book_id", bookId).del();
          await trx("BookTag").where("book_id", bookId).del();
          await trx("BookSeries").where("book_id", bookId).del();
          await trx("BookGroup").where("book_id", bookId).del();
          await trx("BookCharacter").where("book_id", bookId).del();
        } else {
          const bookToInsert = {
            title: cleanValue(bookData.title),
            path: bookData.path,
            page_count: bookData.page_count || 0,
            added_at: bookData.added_at,
            hitomi_id: cleanValue(bookData.hitomi_id),
            type: cleanValue(bookData.type),
            language_name_english: cleanValue(bookData.language_name_english),
            language_name_local: cleanValue(bookData.language_name_local),
          };
          const result = await trx("Book").insert(bookToInsert);
          bookId = result[0];
          console.log(
            `[Main] 새 책 추가. ID: ${bookId}, Title: ${bookData.title}`,
          );
          addedCount++;
        }

        // 아티스트, 그룹, 캐릭터, 태그, 시리즈 처리
        const artistsToProcess =
          infoMetadata.artists
            ?.map((a) => cleanValue(a.name))
            .filter(Boolean) || [];
        for (const artistName of artistsToProcess) {
          let artist = await trx("Artist").where("name", artistName).first();
          if (!artist) {
            const [newArtistId] = await trx("Artist").insert({
              name: artistName,
            });
            artist = { id: newArtistId, name: artistName };
          }
          await trx("BookArtist").insert({
            book_id: bookId,
            artist_id: artist.id,
          });
        }

        const groupsToProcess =
          infoMetadata.groups?.map((g) => cleanValue(g.name)).filter(Boolean) ||
          [];
        for (const groupName of groupsToProcess) {
          let group = await trx("Group").where("name", groupName).first();
          if (!group) {
            const [newGroupId] = await trx("Group").insert({
              name: groupName,
            });
            group = { id: newGroupId, name: groupName };
          }
          await trx("BookGroup").insert({
            book_id: bookId,
            group_id: group.id,
          });
        }

        const charactersToProcess =
          infoMetadata.characters
            ?.map((c) => cleanValue(c.name))
            .filter(Boolean) || [];
        for (const characterName of charactersToProcess) {
          let character = await trx("Character")
            .where("name", characterName)
            .first();
          if (!character) {
            const [newCharacterId] = await trx("Character").insert({
              name: characterName,
            });
            character = { id: newCharacterId, name: characterName };
          }
          await trx("BookCharacter").insert({
            book_id: bookId,
            character_id: character.id,
          });
        }

        const tagsToProcess =
          infoMetadata.tags?.map((t) => cleanValue(t.name)).filter(Boolean) ||
          [];
        for (const tagName of tagsToProcess) {
          let tag = await trx("Tag").where("name", tagName).first();
          if (!tag) {
            const [newTagId] = await trx("Tag").insert({ name: tagName });
            tag = { id: newTagId, name: tagName };
          }
          await trx("BookTag").insert({ book_id: bookId, tag_id: tag.id });
        }

        if (infoMetadata.series && infoMetadata.series.length > 0) {
          const seriesName = infoMetadata.series[0].name;
          let series = await trx("Series").where("name", seriesName).first();
          if (!series) {
            const [newSeriesId] = await trx("Series").insert({
              name: seriesName,
            });
            series = { id: newSeriesId, name: seriesName };
          }
          await trx("BookSeries").insert({
            book_id: bookId,
            series_id: series.id,
          });
        }

        // 썸네일 생성 필요 여부 결정
        const currentBookInDb = await trx("Book").where("id", bookId).first();
        if (coverPath) {
          if (!currentBookInDb?.cover_path) {
            shouldGenerateThumbnail = true;
          } else {
            try {
              await fs.access(currentBookInDb.cover_path);
            } catch {
              shouldGenerateThumbnail = true;
              console.warn(
                `[Main] Existing thumbnail file not found for book ${bookId}. Regenerating.`,
              );
            }
          }
        }
      }); // End of db.transaction

      // 단일 파일 스캔 후 썸네일 생성 및 DB 업데이트
      if (shouldGenerateThumbnail && bookId) {
        const result = await generateThumbnailForBook(bookId);
        if (result) {
          await db("Book")
            .where("id", result.bookId)
            .update({ cover_path: result.thumbnailPath });
        }
      }
    }

    console.log(
      `[Main] Scan complete for ${filePath}: Added ${addedCount}, Updated ${updatedCount}`,
    );

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("books-updated");
    });
  } catch (error) {
    console.error(`[Main] Error scanning file ${filePath}:`, error);
  }
}

export const handleRescanLibraryFolder = async (folderPath: string) => {
  try {
    const { added, updated, deleted } = await scanDirectory(folderPath, 0);
    console.log(
      `[Main] Rescan complete for ${folderPath}: Added ${added}, Updated ${updated}, Deleted ${deleted}`,
    );
    return { success: true, added, updated, deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error rescanning folder ${folderPath}:`, error);
    return { success: false, error: message };
  }
};

export function registerDirectoryHandlers() {
  ipcMain.handle("add-books-from-directory", (_event) =>
    handleAddBooksFromDirectory(),
  );
  ipcMain.handle("select-folder", (_event) => handleSelectFolder());
  ipcMain.handle("rescan-library-folder", (_event, folderPath) =>
    handleRescanLibraryFolder(folderPath),
  );
}
