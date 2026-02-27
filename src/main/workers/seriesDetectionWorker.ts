import log from "electron-log";
import knex from "knex";
import { parentPort } from "worker_threads";
import type { Book } from "../db/types.js";
import { detectSeriesCandidates } from "../services/seriesDetection/seriesDetector.js";
import type { DetectionOptions } from "../services/seriesDetection/types.js";

interface SeriesCandidate {
  seriesName: string;
  confidence: number;
  books: { book: Book; orderIndex: number }[];
}

if (parentPort) {
  parentPort.on(
    "message",
    async (msg: {
      dbPath: string;
      options: Partial<DetectionOptions>;
      protectManualEdits: boolean;
    }) => {
      const { dbPath, options, protectManualEdits } = msg;

      // Worker 내부에서 DB 연결 생성
      const db = knex({
        client: "better-sqlite3",
        connection: { filename: dbPath },
        useNullAsDefault: true,
      });

      try {
        // 1. 기존 자동 시리즈 삭제
        if (protectManualEdits) {
          const seriesToDelete = await db("SeriesCollection")
            .where("is_auto_generated", true)
            .where("is_manually_edited", false)
            .select("id");

          if (seriesToDelete.length > 0) {
            const idsToDelete = seriesToDelete.map((s) => s.id);

            await db("Book")
              .whereIn("series_collection_id", idsToDelete)
              .update({
                series_collection_id: null,
                series_order_index: null,
              });

            await db("SeriesCollection").whereIn("id", idsToDelete).delete();
          }
        }

        // 2. 시리즈에 속하지 않은 책 조회
        const books = await db("Book")
          .select(
            "Book.*",
            db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
            db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
          )
          .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
          .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
          .leftJoin("BookTag", "Book.id", "BookTag.book_id")
          .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
          .whereNull("Book.series_collection_id")
          .groupBy("Book.id");

        // 3. 데이터 변환
        const booksWithArrays: Book[] = books.map((book: any) => ({
          ...book,
          artists: book.artists
            ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
            : [],
          tags: book.tags
            ? book.tags
                .split(",")
                .map((name: string) => ({ id: 0, name, color: null }))
            : [],
        }));

        // 4. 시리즈 감지 알고리즘 실행
        const result = await detectSeriesCandidates(booksWithArrays, options);

        // 5. 감지된 시리즈 저장
        const createdSeries: { id: number; name: string }[] = [];
        const minBooks = (options as any).minBooks || 2;

        for (const candidate of result.candidates) {
          if (candidate.books.length < minBooks) {
            continue;
          }

          await db.transaction(async (trx) => {
            const [seriesId] = await trx("SeriesCollection").insert({
              name: candidate.seriesName,
              is_auto_generated: true,
              is_manually_edited: false,
              confidence_score: candidate.confidence,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });

            for (const bookWithScore of candidate.books) {
              await trx("Book").where("id", bookWithScore.book.id).update({
                series_collection_id: seriesId,
                series_order_index: bookWithScore.orderIndex,
              });
            }

            createdSeries.push({ id: seriesId, name: candidate.seriesName });
          });
        }

        // 6. 빈 시리즈 정리
        await db.transaction(async (trx) => {
          const allSeries = await trx("SeriesCollection").select("id");

          for (const series of allSeries) {
            const bookCount = await trx("Book")
              .where("series_collection_id", series.id)
              .count("* as count")
              .first();

            const count = (bookCount as any)?.count || 0;

            if (count < 2) {
              await trx("Book")
                .where("series_collection_id", series.id)
                .update({
                  series_collection_id: null,
                  series_order_index: null,
                });

              await trx("SeriesCollection").where("id", series.id).delete();
            }
          }
        });

        parentPort?.postMessage({
          success: true,
          data: {
            created_count: createdSeries.length,
            processed_books: result.processedBooks,
            duration: result.duration,
            series: createdSeries,
          },
        });
      } catch (error) {
        log.error("[Worker] 시리즈 감지 실패:", error);
        parentPort?.postMessage({
          success: false,
          error: (error as Error).message,
        });
      } finally {
        // DB 연결 종료
        await db.destroy();
      }
    },
  );
}
