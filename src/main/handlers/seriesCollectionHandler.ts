import { ipcMain } from "electron";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import db from "../db/index.js";
import type {
  Book,
  SeriesCollection,
  SeriesCollectionWithBooks,
} from "../db/types.js";
import { console } from "../main.js";
import { detectSeriesForBook } from "../services/seriesDetection/seriesDetector.js";
import type { DetectionOptions } from "../services/seriesDetection/types.js";
import { store } from "./configHandler.js";

/**
 * Run series detection in a worker thread
 */
function runSeriesDetectionInWorker(
  books: Book[],
  options: Partial<DetectionOptions> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      fileURLToPath(
        new URL("../workers/seriesDetectionWorker.js", import.meta.url),
      ),
    );

    worker.on("message", (msg) => {
      worker.terminate();
      if (msg.success) {
        resolve(msg.data);
      } else {
        reject(new Error(msg.error));
      }
    });

    worker.on("error", (err) => {
      worker.terminate();
      reject(err);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage({ books, options });
  });
}

/**
 * 모든 시리즈 컬렉션 조회 (페이지네이션)
 */
export async function handleGetSeriesCollections(params: {
  page?: number;
  limit?: number;
  filterType?: "all" | "auto" | "manual";
  minConfidence?: number;
  sortBy?: "name" | "book_count" | "confidence" | "created_at";
  sortOrder?: "asc" | "desc";
}) {
  try {
    const {
      page = 1,
      limit = 50,
      filterType = "all",
      minConfidence = 0,
      sortBy = "name",
      sortOrder = "asc",
    } = params;

    const offset = (page - 1) * limit;

    let query = db("SeriesCollection").select("*");

    // 필터 적용
    if (filterType === "auto") {
      query = query.where("is_auto_generated", true);
    } else if (filterType === "manual") {
      query = query.where("is_manually_edited", true);
    }

    if (minConfidence > 0) {
      query = query.where("confidence_score", ">=", minConfidence);
    }

    // 정렬
    query = query.orderBy(sortBy, sortOrder);

    // 페이지네이션
    const collections = await query.limit(limit).offset(offset);

    // 각 시리즈의 책 수 및 첫 번째 책 표지 조회
    const collectionsWithCount = await Promise.all(
      collections.map(async (collection: SeriesCollection) => {
        const bookCount = await db("Book")
          .where("series_collection_id", collection.id)
          .count("* as count")
          .first();

        // 첫 번째 책의 표지 이미지 가져오기 (series_order_index 순)
        const firstBook = await db("Book")
          .where("series_collection_id", collection.id)
          .orderBy("series_order_index", "asc")
          .select("cover_path")
          .first();

        return {
          ...collection,
          book_count: (bookCount as any)?.count || 0,
          cover_image: collection.cover_image || firstBook?.cover_path || null,
        };
      }),
    );

    // 전체 개수
    const totalCountResult = await db("SeriesCollection")
      .count("* as count")
      .first();
    const totalCount = (totalCountResult as any)?.count || 0;

    return {
      success: true,
      data: {
        collections: collectionsWithCount,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    };
  } catch (error) {
    console.error("시리즈 컬렉션 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 특정 시리즈 컬렉션 상세 조회 (소속 책 포함)
 */
export async function handleGetSeriesCollectionById(seriesId: number) {
  try {
    const collection = await db("SeriesCollection")
      .where("id", seriesId)
      .first();

    if (!collection) {
      return {
        success: false,
        error: "시리즈를 찾을 수 없습니다",
      };
    }

    // 소속 책들 조회 (순서대로)
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
      .where("Book.series_collection_id", seriesId)
      .groupBy("Book.id")
      .orderBy("Book.series_order_index", "asc");

    const result: SeriesCollectionWithBooks = {
      ...collection,
      books,
      book_count: books.length,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("시리즈 상세 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 컬렉션 생성 (수동)
 */
export async function handleCreateSeriesCollection(data: {
  name: string;
  description?: string;
  cover_image?: string;
}) {
  try {
    const [id] = await db("SeriesCollection").insert({
      name: data.name,
      description: data.description || null,
      cover_image: data.cover_image || null,
      is_auto_generated: false,
      is_manually_edited: true,
      confidence_score: 1.0,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    const created = await db("SeriesCollection").where("id", id).first();

    return {
      success: true,
      data: created,
    };
  } catch (error) {
    console.error("시리즈 생성 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 컬렉션 수정
 */
export async function handleUpdateSeriesCollection(
  seriesId: number,
  data: Partial<SeriesCollection>,
) {
  try {
    await db("SeriesCollection")
      .where("id", seriesId)
      .update({
        ...data,
        is_manually_edited: true, // 수동 수정 플래그 설정
        updated_at: db.fn.now(),
      });

    const updated = await db("SeriesCollection").where("id", seriesId).first();

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    console.error("시리즈 수정 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 컬렉션 삭제
 */
export async function handleDeleteSeriesCollection(seriesId: number) {
  try {
    await db.transaction(async (trx) => {
      // 소속 책들의 series_collection_id를 NULL로 설정
      await trx("Book").where("series_collection_id", seriesId).update({
        series_collection_id: null,
        series_order_index: null,
      });

      // 시리즈 삭제
      await trx("SeriesCollection").where("id", seriesId).delete();
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("시리즈 삭제 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 자동 시리즈 감지 실행 (전체)
 */
export async function handleRunSeriesDetection(
  options?: Partial<DetectionOptions>,
) {
  try {
    // protectManualEdits 옵션이 true인 경우 (기본값)
    // 수동 편집되지 않은 자동 생성 시리즈만 삭제
    const protectManualEdits = options?.protectManualEdits ?? true;

    if (protectManualEdits) {
      // 자동 생성되고 수동 편집되지 않은 시리즈만 삭제
      await db.transaction(async (trx) => {
        // 삭제할 시리즈들의 ID 조회
        const seriesToDelete = await trx("SeriesCollection")
          .where("is_auto_generated", true)
          .where("is_manually_edited", false)
          .select("id");

        if (seriesToDelete.length > 0) {
          const idsToDelete = seriesToDelete.map((s) => s.id);

          // 해당 시리즈에 속한 책들의 series_collection_id를 NULL로
          await trx("Book")
            .whereIn("series_collection_id", idsToDelete)
            .update({
              series_collection_id: null,
              series_order_index: null,
            });

          // 시리즈 삭제
          await trx("SeriesCollection").whereIn("id", idsToDelete).delete();
        }
      });
    }

    // 시리즈에 속하지 않은 책만 조회 (중복 방지)
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
      .whereNull("Book.series_collection_id") // 시리즈에 속하지 않은 책만
      .groupBy("Book.id");

    // 각 책의 artists와 tags를 배열로 변환
    const booksWithArrays = books.map((book: any) => ({
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

    // 자동 감지 실행
    const result = await runSeriesDetectionInWorker(booksWithArrays, options);

    // 감지된 후보들을 DB에 저장
    const createdSeries: SeriesCollection[] = [];

    for (const candidate of result.candidates) {
      // 책이 2개 미만이면 스킵 (빈 시리즈 또는 1개만 있는 시리즈 방지)
      if (candidate.books.length < 2) {
        continue;
      }

      // 트랜잭션으로 시리즈 생성 및 책 매핑
      await db.transaction(async (trx) => {
        // 시리즈 생성
        const [seriesId] = await trx("SeriesCollection").insert({
          name: candidate.seriesName,
          is_auto_generated: true,
          is_manually_edited: false,
          confidence_score: candidate.confidence,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        });

        // 책들에 시리즈 매핑
        for (const bookWithScore of candidate.books) {
          await trx("Book").where("id", bookWithScore.book.id).update({
            series_collection_id: seriesId,
            series_order_index: bookWithScore.orderIndex,
          });
        }

        const created = await trx("SeriesCollection")
          .where("id", seriesId)
          .first();
        createdSeries.push(created);
      });
    }

    // 빈 시리즈 및 1개만 있는 시리즈 정리
    const cleanupResult = await handleCleanupEmptySeries();
    const cleanedCount = cleanupResult.success
      ? cleanupResult.data?.deleted_count || 0
      : 0;

    return {
      success: true,
      data: {
        created_count: createdSeries.length,
        processed_books: result.processedBooks,
        duration: result.duration,
        cleaned_count: cleanedCount,
        series: createdSeries,
      },
    };
  } catch (error) {
    console.error("자동 감지 실행 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 특정 책에 대한 시리즈 감지
 */
export async function handleRunSeriesDetectionForBook(
  bookId: number,
  options?: Partial<DetectionOptions>,
) {
  try {
    // 대상 책 조회
    const targetBook = await db("Book")
      .select(
        "Book.*",
        db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
        db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      )
      .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
      .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
      .leftJoin("BookTag", "Book.id", "BookTag.book_id")
      .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
      .where("Book.id", bookId)
      .groupBy("Book.id")
      .first();

    if (!targetBook) {
      return {
        success: false,
        error: "책을 찾을 수 없습니다",
      };
    }

    // 모든 책 조회
    const allBooks = await db("Book")
      .select(
        "Book.*",
        db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
        db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      )
      .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
      .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
      .leftJoin("BookTag", "Book.id", "BookTag.book_id")
      .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
      .groupBy("Book.id");

    // 배열 변환
    const convertBook = (book: any): Book => ({
      ...book,
      artists: book.artists
        ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
        : [],
      tags: book.tags
        ? book.tags
            .split(",")
            .map((name: string) => ({ id: 0, name, color: null }))
        : [],
    });

    const candidate = await detectSeriesForBook(
      convertBook(targetBook),
      allBooks.map(convertBook),
      options,
    );

    if (!candidate) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: candidate,
    };
  } catch (error) {
    console.error("책 시리즈 감지 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 책 추가 시 자동으로 시리즈 감지 및 생성
 * config의 seriesDetectionSettings를 참조하여 자동으로 시리즈를 감지하고 생성합니다.
 */
export async function handleAutoDetectSeriesForBook(bookId: number) {
  try {
    // config에서 시리즈 감지 설정 가져오기
    const seriesSettings = store.get("seriesDetectionSettings", {
      minConfidence: 0.7,
      minBooks: 2,
    });

    // 대상 책 조회
    const targetBook = await db("Book")
      .select(
        "Book.*",
        db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
        db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      )
      .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
      .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
      .leftJoin("BookTag", "Book.id", "BookTag.book_id")
      .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
      .where("Book.id", bookId)
      .whereNull("Book.series_collection_id") // 이미 시리즈에 속한 책은 제외
      .groupBy("Book.id")
      .first();

    if (!targetBook) {
      return; // 책이 없거나 이미 시리즈에 속한 경우 종료
    }

    // 모든 책 조회 (시리즈에 속하지 않은 책만)
    const allBooks = await db("Book")
      .select(
        "Book.*",
        db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
        db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
      )
      .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
      .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
      .leftJoin("BookTag", "Book.id", "BookTag.book_id")
      .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
      .whereNull("Book.series_collection_id") // 시리즈에 속하지 않은 책만
      .groupBy("Book.id");

    // 배열 변환
    const convertBook = (book: any): Book => ({
      ...book,
      artists: book.artists
        ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
        : [],
      tags: book.tags
        ? book.tags
            .split(",")
            .map((name: string) => ({ id: 0, name, color: null }))
        : [],
    });

    const candidate = await detectSeriesForBook(
      convertBook(targetBook),
      allBooks.map(convertBook),
      seriesSettings,
    );

    if (!candidate || candidate.books.length < seriesSettings.minBooks) {
      return; // 감지된 시리즈가 없거나 최소 책 수 미달 시 종료
    }

    // 시리즈 생성 및 책 할당
    await db.transaction(async (trx) => {
      // 시리즈 생성
      const [seriesId] = await trx("SeriesCollection").insert({
        name: candidate.seriesName,
        confidence_score: candidate.confidence,
        is_auto_generated: true,
        is_manually_edited: false,
        detection_reason: JSON.stringify(candidate.detectionReason),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      // 책들을 시리즈에 할당
      for (const bookWithScore of candidate.books) {
        await trx("Book").where("id", bookWithScore.book.id).update({
          series_collection_id: seriesId,
          series_order_index: bookWithScore.orderIndex,
        });
      }
    });
  } catch (error) {
    console.error("자동 시리즈 감지 실패:", error);
    // 에러가 발생해도 책 추가 프로세스는 계속 진행되도록 함
  }
}

/**
 * 시리즈에 책 추가
 */
export async function handleAddBookToSeries(
  bookId: number,
  seriesId: number,
  orderIndex?: number,
) {
  try {
    // 순서 인덱스가 없으면 자동 할당
    let finalOrderIndex = orderIndex;

    if (finalOrderIndex === undefined) {
      const maxOrder = await db("Book")
        .where("series_collection_id", seriesId)
        .max("series_order_index as max")
        .first();

      finalOrderIndex = ((maxOrder as any)?.max || 0) + 1;
    }

    await db("Book").where("id", bookId).update({
      series_collection_id: seriesId,
      series_order_index: finalOrderIndex,
    });

    // 시리즈를 수동 편집으로 표시
    await db("SeriesCollection").where("id", seriesId).update({
      is_manually_edited: true,
      updated_at: db.fn.now(),
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("시리즈에 책 추가 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈에서 책 제거
 */
export async function handleRemoveBookFromSeries(bookId: number) {
  try {
    const book = await db("Book").where("id", bookId).first();

    if (!book || !book.series_collection_id) {
      return {
        success: false,
        error: "책이 시리즈에 속해있지 않습니다",
      };
    }

    const seriesId = book.series_collection_id;

    await db("Book").where("id", bookId).update({
      series_collection_id: null,
      series_order_index: null,
    });

    // 시리즈를 수동 편집으로 표시
    await db("SeriesCollection").where("id", seriesId).update({
      is_manually_edited: true,
      updated_at: db.fn.now(),
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("시리즈에서 책 제거 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 내 책 순서 변경
 */
export async function handleReorderBooksInSeries(
  seriesId: number,
  bookIds: number[],
) {
  try {
    await db.transaction(async (trx) => {
      for (let i = 0; i < bookIds.length; i++) {
        await trx("Book")
          .where("id", bookIds[i])
          .update({
            series_order_index: i + 1,
          });
      }

      // 시리즈를 수동 편집으로 표시
      await trx("SeriesCollection").where("id", seriesId).update({
        is_manually_edited: true,
        updated_at: db.fn.now(),
      });
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("책 순서 변경 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 병합
 */
export async function handleMergeSeriesCollections(
  sourceId: number,
  targetId: number,
) {
  try {
    await db.transaction(async (trx) => {
      // source 시리즈의 책들을 target 시리즈로 이동
      const sourceBooks = await trx("Book")
        .where("series_collection_id", sourceId)
        .select("*");

      // target 시리즈의 현재 최대 순서
      const maxOrder = await trx("Book")
        .where("series_collection_id", targetId)
        .max("series_order_index as max")
        .first();

      let nextOrder = ((maxOrder as any)?.max || 0) + 1;

      for (const book of sourceBooks) {
        await trx("Book").where("id", book.id).update({
          series_collection_id: targetId,
          series_order_index: nextOrder++,
        });
      }

      // source 시리즈 삭제
      await trx("SeriesCollection").where("id", sourceId).delete();

      // target 시리즈를 수동 편집으로 표시
      await trx("SeriesCollection").where("id", targetId).update({
        is_manually_edited: true,
        updated_at: db.fn.now(),
      });
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("시리즈 병합 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 내에서 이전/다음 책 가져오기
 */
export async function handleGetSeriesNavigationBook(params: {
  currentBookId: number;
  direction: "prev" | "next";
}) {
  try {
    const { currentBookId, direction } = params;

    // 현재 책 조회
    const currentBook = await db("Book")
      .where("id", currentBookId)
      .select("series_collection_id", "series_order_index")
      .first();

    if (!currentBook || !currentBook.series_collection_id) {
      return {
        success: true,
        data: null,
      };
    }

    // 이전/다음 책 찾기
    const operator = direction === "prev" ? "<" : ">";
    const orderDirection = direction === "prev" ? "desc" : "asc";

    const nextBook = await db("Book")
      .where("series_collection_id", currentBook.series_collection_id)
      .where("series_order_index", operator, currentBook.series_order_index)
      .orderBy("series_order_index", orderDirection)
      .select("id", "title")
      .first();

    if (!nextBook) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: {
        bookId: nextBook.id,
        bookTitle: nextBook.title,
      },
    };
  } catch (error) {
    console.error("시리즈 네비게이션 책 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈 분할
 */
export async function handleSplitSeriesCollection(
  sourceSeriesId: number,
  bookIds: number[],
  newSeriesName: string,
) {
  try {
    let newSeriesId: number;

    await db.transaction(async (trx) => {
      // 새 시리즈 생성
      [newSeriesId] = await trx("SeriesCollection").insert({
        name: newSeriesName,
        is_auto_generated: false,
        is_manually_edited: true,
        confidence_score: 1.0,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // 선택된 책들을 새 시리즈로 이동
      for (let i = 0; i < bookIds.length; i++) {
        await trx("Book")
          .where("id", bookIds[i])
          .update({
            series_collection_id: newSeriesId,
            series_order_index: i + 1,
          });
      }

      // 원본 시리즈를 수동 편집으로 표시
      await trx("SeriesCollection").where("id", sourceSeriesId).update({
        is_manually_edited: true,
        updated_at: db.fn.now(),
      });
    });

    const newSeries = await db("SeriesCollection")
      .where("id", newSeriesId!)
      .first();

    return {
      success: true,
      data: newSeries,
    };
  } catch (error) {
    console.error("시리즈 분할 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈의 다음 권 조회
 */
export async function handleGetNextBookInSeries(currentBookId: number) {
  try {
    const currentBook = await db("Book").where("id", currentBookId).first();

    if (!currentBook || !currentBook.series_collection_id) {
      return {
        success: false,
        error: "책이 시리즈에 속해있지 않습니다",
      };
    }

    const nextBook = await db("Book")
      .where("series_collection_id", currentBook.series_collection_id)
      .where("series_order_index", ">", currentBook.series_order_index || 0)
      .orderBy("series_order_index", "asc")
      .first();

    return {
      success: true,
      data: nextBook || null,
    };
  } catch (error) {
    console.error("다음 권 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈의 이전 권 조회
 */
export async function handleGetPreviousBookInSeries(currentBookId: number) {
  try {
    const currentBook = await db("Book").where("id", currentBookId).first();

    if (!currentBook || !currentBook.series_collection_id) {
      return {
        success: false,
        error: "책이 시리즈에 속해있지 않습니다",
      };
    }

    const prevBook = await db("Book")
      .where("series_collection_id", currentBook.series_collection_id)
      .where("series_order_index", "<", currentBook.series_order_index || 0)
      .orderBy("series_order_index", "desc")
      .first();

    return {
      success: true,
      data: prevBook || null,
    };
  } catch (error) {
    console.error("이전 권 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 시리즈의 전체 책 목록 조회
 */
export async function handleGetSeriesBooks(seriesId: number) {
  try {
    const books = await db("Book")
      .where("series_collection_id", seriesId)
      .orderBy("series_order_index", "asc")
      .select("*");

    return {
      success: true,
      data: books,
    };
  } catch (error) {
    console.error("시리즈 책 목록 조회 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 빈 시리즈 또는 1개만 있는 시리즈 정리
 */
export async function handleCleanupEmptySeries() {
  try {
    let deletedCount = 0;

    await db.transaction(async (trx) => {
      // 모든 시리즈 조회
      const allSeries = await trx("SeriesCollection").select("id");

      for (const series of allSeries) {
        // 각 시리즈의 책 수 확인
        const bookCount = await trx("Book")
          .where("series_collection_id", series.id)
          .count("* as count")
          .first();

        const count = (bookCount as any)?.count || 0;

        // 책이 2개 미만이면 삭제
        if (count < 2) {
          // 소속 책들의 series_collection_id를 NULL로 설정
          await trx("Book").where("series_collection_id", series.id).update({
            series_collection_id: null,
            series_order_index: null,
          });

          // 시리즈 삭제
          await trx("SeriesCollection").where("id", series.id).delete();
          deletedCount++;
        }
      }
    });

    return {
      success: true,
      data: {
        deleted_count: deletedCount,
      },
    };
  } catch (error) {
    console.error("빈 시리즈 정리 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * IPC 핸들러 등록
 */
export function registerSeriesCollectionHandlers() {
  ipcMain.handle("get-series-collections", (_event, params) =>
    handleGetSeriesCollections(params),
  );
  ipcMain.handle("get-series-collection-by-id", (_event, seriesId) =>
    handleGetSeriesCollectionById(seriesId),
  );
  ipcMain.handle("create-series-collection", (_event, data) =>
    handleCreateSeriesCollection(data),
  );
  ipcMain.handle("update-series-collection", (_event, { seriesId, data }) =>
    handleUpdateSeriesCollection(seriesId, data),
  );
  ipcMain.handle("delete-series-collection", (_event, seriesId) =>
    handleDeleteSeriesCollection(seriesId),
  );
  ipcMain.handle("run-series-detection", (_event, options) =>
    handleRunSeriesDetection(options),
  );
  ipcMain.handle("run-series-detection-for-book", (_event, bookId, options) =>
    handleRunSeriesDetectionForBook(bookId, options),
  );
  ipcMain.handle(
    "add-book-to-series",
    (_event, { bookId, seriesId, orderIndex }) =>
      handleAddBookToSeries(bookId, seriesId, orderIndex),
  );
  ipcMain.handle("remove-book-from-series", (_event, bookId) =>
    handleRemoveBookFromSeries(bookId),
  );
  ipcMain.handle("reorder-books-in-series", (_event, { seriesId, bookIds }) =>
    handleReorderBooksInSeries(seriesId, bookIds),
  );
  ipcMain.handle("merge-series-collections", (_event, sourceId, targetId) =>
    handleMergeSeriesCollections(sourceId, targetId),
  );
  ipcMain.handle(
    "split-series-collection",
    (_event, sourceSeriesId, bookIds, newSeriesName) =>
      handleSplitSeriesCollection(sourceSeriesId, bookIds, newSeriesName),
  );
  ipcMain.handle("get-next-book-in-series", (_event, currentBookId) =>
    handleGetNextBookInSeries(currentBookId),
  );
  ipcMain.handle("get-previous-book-in-series", (_event, currentBookId) =>
    handleGetPreviousBookInSeries(currentBookId),
  );
  ipcMain.handle("get-series-books", (_event, seriesId) =>
    handleGetSeriesBooks(seriesId),
  );
  ipcMain.handle("get-series-navigation-book", (_event, params) =>
    handleGetSeriesNavigationBook(params),
  );
  ipcMain.handle("cleanup-empty-series", () => handleCleanupEmptySeries());
}
