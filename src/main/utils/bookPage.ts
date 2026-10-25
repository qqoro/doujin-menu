import log from "electron-log";
import fs from "fs/promises";
import path from "path";
import db from "../db/index.js";
import { imageMimeType, sortImageFiles } from "./imageFiles.js";
import { readZipPage } from "./zipPages.js";

/**
 * 책의 pageIndex번째 페이지 이미지를 응답으로 만든다.
 * `doujin-menu://` 프로토콜과 모바일 웹의 `/media/page`가 함께 쓴다.
 */
export async function serveBookPage(
  bookId: number,
  pageIndex: number,
): Promise<Response> {
  if (isNaN(bookId) || isNaN(pageIndex)) {
    return new Response("Invalid URL", { status: 400 });
  }

  try {
    const book = await db("Book").where("id", bookId).first();

    if (!book || !book.path) {
      log.error(`[Main] Book not found or path missing for bookId: ${bookId}`);
      return new Response("Book not found", { status: 404 });
    }

    const bookPath = book.path;

    const isDirectory = await fs
      .stat(bookPath)
      .then((stat) => stat.isDirectory())
      .catch(() => false);

    if (isDirectory) {
      const imageFiles = sortImageFiles(await fs.readdir(bookPath));

      if (pageIndex >= 0 && pageIndex < imageFiles.length) {
        const imagePath = path.join(bookPath, imageFiles[pageIndex]);
        const imageBuffer = await fs.readFile(imagePath);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response(imageBuffer as any, {
          headers: { "Content-Type": imageMimeType(imagePath) },
        });
      } else {
        return new Response("Page not found", { status: 404 });
      }
    } else if (/\.(cbz|zip)$/i.exec(bookPath)) {
      const page = await readZipPage(bookPath, pageIndex);

      if (!page) {
        return new Response("Page not found in zip", { status: 404 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Response(page.buffer as any, {
        headers: { "Content-Type": imageMimeType(page.fileName) },
      });
    } else {
      return new Response("Unsupported book format", { status: 400 });
    }
  } catch (error) {
    log.error(`[Main] Error handling doujin-menu protocol request:`, error);
    return new Response("Internal server error", { status: 500 });
  }
}
