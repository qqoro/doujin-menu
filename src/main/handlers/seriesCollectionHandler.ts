import { app, ipcMain } from "electron";
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
import { computeComparisonKey } from "../services/seriesDetection/titlePatternMatcher.js";
import { PrefixIndex } from "../services/seriesDetection/prefixIndex.js";
import type { SerializedIndexEntry } from "../services/seriesDetection/prefixIndex.js";
import type { DetectionOptions } from "../services/seriesDetection/types.js";
import { store } from "./configHandler.js";

// 전역 접두사 인덱스 (앱 시작 시 초기화)
let prefixIndex: PrefixIndex | null = null;

/**
 * 접두사 인덱스를 DB에서 재구축합니다.
 * 앱 시작 시 또는 전체 재감지 후 호출합니다.
 */
export async function rebuildPrefixIndex(): Promise<PrefixIndex> {
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
    .groupBy("Book.id");

  // 배열 변환
  const convertBook = (
    book: Record<string, unknown> & {
      artists?: string;
      tags?: string;
    },
  ): Book =>
    ({
      ...book,
      artists: book.artists
        ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
        : [],
      tags: book.tags
        ? book.tags
            .split(",")
            .map((name: string) => ({ id: 0, name, color: null }))
        : [],
    }) as Book;

  const booksWithArrays = books.map(convertBook);

  // 시리즈 컬렉션과 해당 bookIds 조회 — JOIN 1회 쿼리로 N+1 해결
  const seriesRows = await db("SeriesCollection")
    .select(
      "SeriesCollection.id",
      "SeriesCollection.name",
      "Book.id as book_id",
    )
    .leftJoin("Book", "Book.series_collection_id", "SeriesCollection.id");

  const seriesMap = new Map<
    number,
    { id: number; name: string; bookIds: number[] }
  >();
  for (const row of seriesRows) {
    if (!seriesMap.has(row.id)) {
      seriesMap.set(row.id, { id: row.id, name: row.name, bookIds: [] });
    }
    if (row.book_id) {
      seriesMap.get(row.id)!.bookIds.push(row.book_id);
    }
  }
  const seriesData = [...seriesMap.values()];

  const index = new PrefixIndex();
  index.rebuild(booksWithArrays, seriesData);
  prefixIndex = index;
  return index;
}

/**
 * 현재 접두사 인덱스를 반환합니다.
 */
export function getPrefixIndex(): PrefixIndex | null {
  return prefixIndex;
}

/**
 * 워커에서 전송한 직렬화 데이터로 PrefixIndex를 복원합니다.
 * DB 조회 없이 메인 스레드 블로킹 없이 인덱스를 재구축합니다.
 */
export function loadPrefixIndexFromData(entries: SerializedIndexEntry[]): void {
  const index = new PrefixIndex();
  index.loadEntries(entries);
  prefixIndex = index;
  console.log(
    `[SeriesCollection] PrefixIndex 복원 완료 (${entries.length}개 엔트리)`,
  );
}

/**
 * Worker 스레드에서 시리즈 감지 실행 (DB 작업 포함)
 * 메인 스레드를 차단하지 않음
 */
function runSeriesDetectionInWorker(
  options: Partial<DetectionOptions> = {},
  protectManualEdits: boolean = true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return new Promise((resolve, reject) => {
    // DB 경로 결정
    const isDevelopment = process.env.NODE_ENV === "development";
    const dbPath = isDevelopment
      ? "./dev.sqlite3"
      : app.getPath("userData") + "/database.db";

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

    // DB 경로와 설정만 전달 (책 데이터는 Worker 내부에서 조회)
    worker.postMessage({ dbPath, options, protectManualEdits });
  });
}

/**
 * 검색어 프리픽스 정규식 (artist:, tag:, type: 지원)
 */
const SERIES_PREFIXED_TERM_REGEX =
  /(artist|tag|type):(.+?)(?=\s+(?!(?:artist|tag|type):)|\s*(?:artist|tag|type):|$)/g;

/**
 * 검색어 파싱 결과 타입
 */
interface SeriesParsedSearchTerms {
  /** 시리즈 이름 LIKE 검색어 */
  nameTerms: string[];
  /** artist:xxx 프리픽스 필터 */
  artistTerms: string[];
  /** tag:xxx 프리픽스 필터 */
  tagTerms: string[];
  /** type:xxx 프리픽스 필터 */
  typeTerms: string[];
}

/**
 * 검색어 문자열을 프리픽스별로 분류하여 반환
 * - artist:xxx, tag:xxx, type:xxx 는 각각의 배열에 추가
 * - 나머지 텍스트는 nameTerms에 추가하여 시리즈 이름 LIKE 검색에 사용
 */
function parseSeriesSearchQuery(searchQuery: string): SeriesParsedSearchTerms {
  const result: SeriesParsedSearchTerms = {
    nameTerms: [],
    artistTerms: [],
    tagTerms: [],
    typeTerms: [],
  };

  if (!searchQuery) return result;

  const lowerCaseQuery = searchQuery.toLowerCase();
  const rawNameTerms: string[] = [];

  let lastIndex = 0;
  let match;

  while ((match = SERIES_PREFIXED_TERM_REGEX.exec(lowerCaseQuery)) !== null) {
    const prefix = match[1];
    const value = match[2].trim();

    // 프리픽스 앞에 있는 텍스트는 이름 검색어로 처리
    const leadingText = lowerCaseQuery.substring(lastIndex, match.index).trim();
    if (leadingText) {
      rawNameTerms.push(...leadingText.split(" ").filter((t) => t.length > 0));
    }

    switch (prefix) {
      case "artist":
        result.artistTerms.push(value);
        break;
      case "tag":
        result.tagTerms.push(value);
        break;
      case "type":
        result.typeTerms.push(value);
        break;
    }

    lastIndex = match.index + match[0].length;
  }

  // 마지막 프리픽스 이후 남은 텍스트
  const remainingText = lowerCaseQuery.substring(lastIndex).trim();
  if (remainingText) {
    rawNameTerms.push(...remainingText.split(" ").filter((t) => t.length > 0));
  }

  result.nameTerms = rawNameTerms;
  return result;
}

/**
 * 모든 시리즈 컬렉션 조회 (페이지네이션, 검색 지원)
 *
 * 검색 문법:
 * - 접두어: artist:이름, tag:태그, type:타입
 * - 접두어 없는 텍스트: 시리즈 이름 LIKE 검색
 * - 여러 검색어는 AND 결합
 *
 * 페이지네이션:
 * - 기존 page/limit (page는 1-based) 또는 pageParam/pageSize (pageParam은 0-based) 지원
 * - 둘 다 제공되면 pageParam/pageSize가 우선
 */
export async function handleGetSeriesCollections(params: {
  page?: number;
  limit?: number;
  /** 무한 스크롤용 페이지 (0-based). 제공 시 page 대신 사용 */
  pageParam?: number;
  /** 무한 스크롤용 페이지 크기. 제공 시 limit 대신 사용 */
  pageSize?: number;
  filterType?: "all" | "auto" | "manual";
  minConfidence?: number;
  sortBy?: "name" | "book_count" | "confidence_score" | "created_at";
  sortOrder?: "asc" | "desc";
  /** 검색어 (artist:xxx, tag:xxx, type:xxx 프리픽스 지원) */
  searchQuery?: string;
}) {
  try {
    const {
      page = 1,
      limit = 50,
      pageParam,
      pageSize,
      filterType = "all",
      minConfidence = 0,
      sortBy = "name",
      sortOrder = "asc",
      searchQuery = "",
    } = params;

    // 무한 스크롤(pageParam/pageSize) 우선, 없으면 기존 page/limit 사용
    const effectivePage = pageParam !== undefined ? pageParam : page; // pageParam은 0-based, page는 1-based → offset 계산에서 보정
    const effectiveLimit = pageSize !== undefined ? pageSize : limit;
    const isPageParam = pageParam !== undefined;
    const offset = isPageParam
      ? effectivePage * effectiveLimit
      : (effectivePage - 1) * effectiveLimit;

    // 검색어 파싱
    const parsedSearch = parseSeriesSearchQuery(searchQuery);
    const hasPrefixFilters =
      parsedSearch.artistTerms.length > 0 ||
      parsedSearch.tagTerms.length > 0 ||
      parsedSearch.typeTerms.length > 0;

    // JOIN은 프리픽스 필터(artist, tag, type)가 있을 때만 필요
    // 이름 검색은 SeriesCollection.name에 대한 단순 WHERE LIKE이므로 JOIN 불필요
    const needsJoin = hasPrefixFilters;

    // 기본 쿼리: JOIN이 필요하면 명시적으로 테이블명 붙임
    let query = needsJoin
      ? db("SeriesCollection").select("SeriesCollection.*")
      : db("SeriesCollection").select("*");

    // 프리픽스 필터가 있으면 Book JOIN 필요
    if (needsJoin) {
      query = query.leftJoin(
        "Book",
        "SeriesCollection.id",
        "Book.series_collection_id",
      );
    }

    // 프리픽스 필터 (artist) - Book → BookArtist → Artist JOIN
    if (parsedSearch.artistTerms.length > 0) {
      query = query
        .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
        .leftJoin("Artist", "BookArtist.artist_id", "Artist.id");
    }

    // 프리픽스 필터 (tag) - Book → BookTag → Tag JOIN
    if (parsedSearch.tagTerms.length > 0) {
      query = query
        .leftJoin("BookTag", "Book.id", "BookTag.book_id")
        .leftJoin("Tag", "BookTag.tag_id", "Tag.id");
    }

    // 프리픽스 필터 (type) - Book.type 직접 필터
    if (parsedSearch.typeTerms.length > 0) {
      // type은 Book 컬럼 직접 접근 (추가 JOIN 불필요)
    }

    // 시리즈 이름 LIKE 검색 (접두어 없는 텍스트)
    if (parsedSearch.nameTerms.length > 0) {
      for (const term of parsedSearch.nameTerms) {
        query = query.where("SeriesCollection.name", "like", `%${term}%`);
      }
    }

    // 프리픽스 필터가 있으면 GROUP BY + HAVING으로 매칭 조건 적용
    if (hasPrefixFilters) {
      query = query.groupBy("SeriesCollection.id");

      // 각 프리픽스 필터에 대해 HAVING 조건 생성
      // SUM(CASE WHEN ...) > 0 으로 해당 조건을 만족하는 레코드가 하나라도 있는지 확인
      // 파라미터 바인딩을 사용하여 SQL 인젝션 방지
      const havingClauses: string[] = [];
      const havingBindings: string[] = [];

      if (parsedSearch.artistTerms.length > 0) {
        const artistParts: string[] = [];
        for (const term of parsedSearch.artistTerms) {
          artistParts.push(
            "SUM(CASE WHEN LOWER(Artist.name) LIKE ? THEN 1 ELSE 0 END) > 0",
          );
          havingBindings.push(`%${term}%`);
        }
        havingClauses.push(`(${artistParts.join(" AND ")})`);
      }

      if (parsedSearch.tagTerms.length > 0) {
        const tagParts: string[] = [];
        for (const term of parsedSearch.tagTerms) {
          tagParts.push(
            "SUM(CASE WHEN LOWER(Tag.name) LIKE ? THEN 1 ELSE 0 END) > 0",
          );
          havingBindings.push(`%${term}%`);
        }
        havingClauses.push(`(${tagParts.join(" AND ")})`);
      }

      if (parsedSearch.typeTerms.length > 0) {
        const typeParts: string[] = [];
        for (const term of parsedSearch.typeTerms) {
          typeParts.push(
            "SUM(CASE WHEN LOWER(Book.type) LIKE ? THEN 1 ELSE 0 END) > 0",
          );
          havingBindings.push(`%${term}%`);
        }
        havingClauses.push(`(${typeParts.join(" AND ")})`);
      }

      if (havingClauses.length > 0) {
        query = query.havingRaw(havingClauses.join(" AND "), havingBindings);
      }
    }

    // 필터 적용
    if (filterType === "auto") {
      query = query.where("SeriesCollection.is_auto_generated", true);
    } else if (filterType === "manual") {
      query = query.where("SeriesCollection.is_manually_edited", true);
    }

    if (minConfidence > 0) {
      query = query.where(
        "SeriesCollection.confidence_score",
        ">=",
        minConfidence,
      );
    }

    // 정렬 (book_count 정렬은 서브쿼리 사용, 나머지는 직접 정렬)
    if (sortBy === "book_count") {
      query = query.orderByRaw(
        `(SELECT COUNT(*) FROM Book WHERE Book.series_collection_id = SeriesCollection.id) ${sortOrder}`,
      );
    } else {
      const sortColumn = needsJoin ? `SeriesCollection.${sortBy}` : sortBy;
      query = query.orderBy(sortColumn, sortOrder);
    }

    // 전체 개수 (페이지네이션 전에 카운트)
    let totalCount: number;

    if (hasPrefixFilters) {
      // HAVING이 있는 경우 서브쿼리로 카운트
      const countQuery = query.clone();
      const countResult = await db
        .from(countQuery.as("filtered"))
        .count("* as count")
        .first();
      totalCount = (countResult as { count: number } | undefined)?.count || 0;
    } else if (parsedSearch.nameTerms.length > 0) {
      // 이름 검색만 있는 경우 (JOIN 없이 단순 WHERE LIKE)
      let totalQuery = db("SeriesCollection").count("* as count");

      for (const term of parsedSearch.nameTerms) {
        totalQuery = totalQuery.where(
          "SeriesCollection.name",
          "like",
          `%${term}%`,
        );
      }

      const totalResult = await totalQuery.first();
      totalCount = (totalResult as { count: number } | undefined)?.count || 0;
    } else {
      // 검색어 없는 일반 카운트
      const totalCountResult = await db("SeriesCollection")
        .count("* as count")
        .first();
      totalCount =
        (totalCountResult as { count: number } | undefined)?.count || 0;
    }

    // 페이지네이션 적용
    const collections = await query.limit(effectiveLimit).offset(offset);

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
          book_count: (bookCount as { count: number } | undefined)?.count || 0,
          cover_image: collection.cover_image || firstBook?.cover_path || null,
        };
      }),
    );

    // 무한 스크롤 지원을 위한 다음 페이지 정보 계산
    const fetchedCount = collections.length;
    const hasNextPage = offset + fetchedCount < totalCount;
    const nextPage = hasNextPage
      ? isPageParam
        ? effectivePage + 1
        : effectivePage + 1
      : undefined;

    return {
      success: true,
      data: {
        collections: collectionsWithCount,
        pagination: {
          page: isPageParam ? effectivePage + 1 : effectivePage,
          limit: effectiveLimit,
          totalCount,
          totalPages: Math.ceil(totalCount / effectiveLimit),
        },
        hasNextPage,
        nextPage,
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
 * 모든 작업이 Worker 스레드에서 수행되어 메인 스레드를 차단하지 않음
 */
export async function handleRunSeriesDetection(
  options?: Partial<DetectionOptions>,
) {
  try {
    const protectManualEdits = options?.protectManualEdits ?? true;

    console.log("[SeriesCollection] Worker 스레드에서 시리즈 감지 시작...");

    // Worker에서 모든 작업 수행 (DB 조회 + 감지 + 저장)
    const result = await runSeriesDetectionInWorker(
      options,
      protectManualEdits,
    );

    console.log(
      `[SeriesCollection] 시리즈 감지 완료: ${result.created_count}개 생성`,
    );

    return {
      success: true,
      data: result,
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

    // 배열 변환 헬퍼
    const convertBook = (
      book: Record<string, unknown> & {
        artists?: string;
        tags?: string;
      },
    ): Book =>
      ({
        ...book,
        artists: book.artists
          ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
          : [],
        tags: book.tags
          ? book.tags
              .split(",")
              .map((name: string) => ({ id: 0, name, color: null }))
          : [],
      }) as Book;

    // PrefixIndex가 있으면 매칭된 책만 로드 (전체 로드 방지)
    const index = getPrefixIndex();
    if (index) {
      const lookup = index.addBook(convertBook(targetBook));

      if (lookup.existingBookIds.length > 0) {
        const matchedBooks = await db("Book")
          .select(
            "Book.*",
            db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
            db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
          )
          .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
          .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
          .leftJoin("BookTag", "Book.id", "BookTag.book_id")
          .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
          .whereIn("Book.id", lookup.existingBookIds)
          .groupBy("Book.id");

        const candidate = await detectSeriesForBook(
          convertBook(targetBook),
          matchedBooks.map(convertBook),
          options,
        );

        if (!candidate) {
          return { success: true, data: null };
        }

        // 시리즈 생성 및 책 할당
        await db.transaction(async (trx) => {
          const [seriesId] = await trx("SeriesCollection").insert({
            name: candidate.seriesName,
            confidence_score: candidate.confidence,
            is_auto_generated: true,
            is_manually_edited: false,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });

          for (const bookWithScore of candidate.books) {
            await trx("Book").where("id", bookWithScore.book.id).update({
              series_collection_id: seriesId,
              series_order_index: bookWithScore.orderIndex,
            });
          }
        });

        return { success: true, data: candidate };
      }

      // 매칭되는 책이 없음
      return { success: true, data: null };
    }

    // PrefixIndex가 없으면 폴백: 전체 책 로드 (이 경로는 드묾)
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

    const candidate = await detectSeriesForBook(
      convertBook(targetBook),
      allBooks.map(convertBook),
      options,
    );

    if (!candidate) {
      return { success: true, data: null };
    }

    // 시리즈 생성 및 책 할당
    await db.transaction(async (trx) => {
      const [seriesId] = await trx("SeriesCollection").insert({
        name: candidate.seriesName,
        confidence_score: candidate.confidence,
        is_auto_generated: true,
        is_manually_edited: false,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      for (const bookWithScore of candidate.books) {
        await trx("Book").where("id", bookWithScore.book.id).update({
          series_collection_id: seriesId,
          series_order_index: bookWithScore.orderIndex,
        });
      }
    });

    return { success: true, data: candidate };
  } catch (error) {
    console.error("시리즈 감지 실행 실패:", error);
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
      return { success: true, matched: false }; // 책이 없거나 이미 시리즈에 속한 경우
    }

    // 배열 변환 헬퍼 (함수 상단에 배치)
    const convertBook = (
      book: Record<string, unknown> & {
        artists?: string;
        tags?: string;
      },
    ): Book =>
      ({
        ...book,
        artists: book.artists
          ? book.artists.split(",").map((name: string) => ({ id: 0, name }))
          : [],
        tags: book.tags
          ? book.tags
              .split(",")
              .map((name: string) => ({ id: 0, name, color: null }))
          : [],
      }) as Book;

    // 1. PrefixIndex로 기존 시리즈 O(1) 조회 (인덱스가 있으면 활용)
    const index = getPrefixIndex();
    if (index) {
      const lookup = index.addBook(convertBook(targetBook));
      const prefix = lookup.prefix;

      if (lookup.seriesId !== null) {
        // 기존 시리즈에 추가
        const maxOrder = await db("Book")
          .where("series_collection_id", lookup.seriesId)
          .max("series_order_index as max")
          .first();
        const nextOrder =
          ((maxOrder as { max: number | null } | undefined)?.max || 0) + 1;

        await db("Book").where("id", bookId).update({
          series_collection_id: lookup.seriesId,
          series_order_index: nextOrder,
        });

        index.setSeriesForPrefix(prefix, lookup.seriesId);
        return { success: true, matched: true, action: "added_to_existing" };
      }

      // 기존 미할당 책과 매칭 → 새 시리즈 생성
      if (lookup.existingBookIds.length > 0) {
        // PrefixIndex가 식별한 매칭 책만 로드 (전체 미할당 로드 방지)
        const matchedBooks = await db("Book")
          .select(
            "Book.*",
            db.raw("GROUP_CONCAT(DISTINCT Artist.name) as artists"),
            db.raw("GROUP_CONCAT(DISTINCT Tag.name) as tags"),
          )
          .leftJoin("BookArtist", "Book.id", "BookArtist.book_id")
          .leftJoin("Artist", "BookArtist.artist_id", "Artist.id")
          .leftJoin("BookTag", "Book.id", "BookTag.book_id")
          .leftJoin("Tag", "BookTag.tag_id", "Tag.id")
          .whereIn("Book.id", lookup.existingBookIds)
          .groupBy("Book.id");

        const candidate = await detectSeriesForBook(
          convertBook(targetBook),
          matchedBooks.map(convertBook),
          seriesSettings,
        );

        if (candidate && candidate.books.length >= seriesSettings.minBooks) {
          await db.transaction(async (trx) => {
            const [seriesId] = await trx("SeriesCollection").insert({
              name: candidate.seriesName,
              confidence_score: candidate.confidence,
              is_auto_generated: true,
              is_manually_edited: false,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            });

            for (const bookWithScore of candidate.books) {
              await trx("Book").where("id", bookWithScore.book.id).update({
                series_collection_id: seriesId,
                series_order_index: bookWithScore.orderIndex,
              });
            }
            index.setSeriesForPrefix(prefix, seriesId);
          });
          return { success: true, matched: true, action: "new_series" };
        }
      }
      return { success: true, matched: false };
    }

    // PrefixIndex가 없으면 DB 쿼리로 폴백
    const title = (targetBook as Record<string, unknown>).title as string;
    const prefix = computeComparisonKey(title).full;
    if (prefix) {
      const existingSeries = await db("SeriesCollection")
        .whereRaw("LOWER(name) = ?", [prefix.toLowerCase()])
        .where("is_auto_generated", true)
        .where("is_manually_edited", false)
        .first();

      if (existingSeries) {
        const maxOrder = await db("Book")
          .where("series_collection_id", existingSeries.id)
          .max("series_order_index as max")
          .first();
        const nextOrder =
          ((maxOrder as { max: number | null } | undefined)?.max || 0) + 1;

        await db("Book").where("id", bookId).update({
          series_collection_id: existingSeries.id,
          series_order_index: nextOrder,
        });

        return { success: true, matched: true, action: "added_to_existing" };
      }
    }

    // 2. 기존 시리즈에 매칭되지 않으면 새 시리즈 감지 시도
    // 참고: 이 경로는 PrefixIndex가 없을 때만 실행됩니다.
    // 스캔 시에는 사전에 PrefixIndex를 구축하므로 거의 실행되지 않습니다.
    // 시리즈에 속하지 않은 다른 책들 조회
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
      .whereNull("Book.series_collection_id")
      .groupBy("Book.id");

    const candidate = await detectSeriesForBook(
      convertBook(targetBook),
      allBooks.map(convertBook),
      seriesSettings,
    );

    if (!candidate || candidate.books.length < seriesSettings.minBooks) {
      return { success: true, matched: false }; // 감지된 시리즈가 없음
    }

    // 시리즈 생성 및 책 할당
    await db.transaction(async (trx) => {
      const [seriesId] = await trx("SeriesCollection").insert({
        name: candidate.seriesName,
        confidence_score: candidate.confidence,
        is_auto_generated: true,
        is_manually_edited: false,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      for (const bookWithScore of candidate.books) {
        await trx("Book").where("id", bookWithScore.book.id).update({
          series_collection_id: seriesId,
          series_order_index: bookWithScore.orderIndex,
        });
      }
    });

    return { success: true, matched: true, action: "new_series" };
  } catch (error) {
    console.error("자동 시리즈 감지 실패:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
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

      finalOrderIndex =
        ((maxOrder as { max: number } | undefined)?.max || 0) + 1;
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

      let nextOrder = ((maxOrder as { max: number } | undefined)?.max || 0) + 1;

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

        const count = (bookCount as { count: number } | undefined)?.count || 0;

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
  ipcMain.handle("auto-detect-series-for-book", (_event, bookId) =>
    handleAutoDetectSeriesForBook(bookId),
  );
}
