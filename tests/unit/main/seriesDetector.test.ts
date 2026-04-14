import { describe, expect, it, vi } from "vitest";
import type { Book } from "../../../src/main/db/types";
import {
  detectSeriesCandidates,
  detectSeriesForBook,
  detectSeriesIncremental,
} from "../../../src/main/services/seriesDetection/seriesDetector";

// electron-log를 모의(mock) 처리하여 테스트 실행 중 로그 출력을 방지합니다.
vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * 테스트용 모의 Book 객체를 생성하는 헬퍼 함수
 * @param id - 책 ID
 * @param title - 책 제목
 * @param artists - 작가 이름 배열
 * @param tags - 태그 이름 배열
 * @returns 모의 Book 객체
 */
const createMockBook = (
  id: number,
  title: string,
  artists: string[] = [],
  tags: string[] = [],
): Book => {
  return {
    id,
    title,
    volume: null,
    path: `C:/books/book_${id}`,
    cover_path: null,
    page_count: 10,
    added_at: new Date().toISOString(),
    last_read_at: null,
    current_page: null,
    is_favorite: false,
    hitomi_id: null,
    artists: artists.map((name, i) => ({ id: 1000 + i, name })),
    tags: tags.map((name, i) => ({ id: 2000 + i, name, color: null })),
    groups: [],
    characters: [],
    type: "folder",
    language_name_english: null,
    language_name_local: null,
    series_collection_id: null,
    series_order_index: null,
  };
};

describe("seriesDetector/detectSeriesCandidates", () => {
  it("기본적인 숫자 접미사를 가진 시리즈를 감지해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "테스트 시리즈 1"),
      createMockBook(2, "테스트 시리즈 2"),
      createMockBook(3, "다른 만화"),
      createMockBook(4, "테스트 시리즈 3"),
    ];

    const result = await detectSeriesCandidates(books);

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.seriesName).toBe("테스트 시리즈"); // 파싱된 접두사
    expect(candidate.books).toHaveLength(3);
    expect(candidate.books.map((b) => b.book.title)).toEqual([
      "테스트 시리즈 1",
      "테스트 시리즈 2",
      "테스트 시리즈 3",
    ]);
    expect(result.processedBooks).toBe(3);
  });

  it("권 번호가 없는 책을 시리즈의 1권으로 처리해야 합니다 (1권이 없을 경우)", async () => {
    const books: Book[] = [
      createMockBook(1, "권 없는 시리즈 2"),
      createMockBook(2, "권 없는 시리즈"), // 1권으로 처리되어야 함
      createMockBook(3, "권 없는 시리즈 3"),
    ];

    const result = await detectSeriesCandidates(books, { minBooks: 2 });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.seriesName).toBe("권 없는 시리즈"); // 정렬 후 1권이 된 책의 제목
    expect(candidate.books).toHaveLength(3);
    expect(candidate.books.map((b) => b.book.title)).toEqual([
      "권 없는 시리즈",
      "권 없는 시리즈 2",
      "권 없는 시리즈 3",
    ]);
    expect(candidate.books[0].volumeNumber).toBe(1);
    expect(candidate.books[1].volumeNumber).toBe(2);
    expect(candidate.books[2].volumeNumber).toBe(3);
  });

  it("권수 없는 책이 2권 이상이어도 첫 번째 책을 1권으로 처리해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "중복 시리즈 2"),
      createMockBook(2, "중복 시리즈"), // 1권으로 처리
      createMockBook(3, "중복 시리즈"), // 중복, null 유지
      createMockBook(4, "중복 시리즈 3"),
    ];

    const result = await detectSeriesCandidates(books, { minBooks: 2 });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(4);
    // 첫 번째 비스핀오프 권수없는 책이 1권으로 설정됨
    expect(candidate.books[0].volumeNumber).toBe(1);
    expect(candidate.books[0].orderIndex).toBe(1);
    // 나머지는 권수 순서대로
    expect(candidate.books[1].volumeNumber).toBe(2);
    expect(candidate.books[2].volumeNumber).toBe(3);
    // 마지막 중복 책은 여전히 null
    expect(candidate.books[3].volumeNumber).toBe(null);
  });

  it("1권이 명시적으로 존재할 때, 권 번호 없는 책을 1권으로 지정하지 않아야 합니다", async () => {
    // 영어 제목을 사용하여 한글/숫자 경계 문제 회피
    const books: Book[] = [
      createMockBook(1, "Explicit Series Vol. 1"),
      createMockBook(2, "Explicit Series"), // 1권으로 지정되면 안됨
      createMockBook(3, "Explicit Series Vol. 3"),
    ];

    const result = await detectSeriesCandidates(books, { minBooks: 2 });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(3);

    const bookWithoutVolume = candidate.books.find(
      (b) => b.book.title === "Explicit Series",
    );
    const bookWithVolume1 = candidate.books.find(
      (b) => b.book.title === "Explicit Series Vol. 1",
    );

    expect(bookWithVolume1?.volumeNumber).toBe(1);
    expect(bookWithoutVolume?.volumeNumber).toBe(null);
  });

  it("`requireArtistMatch` 옵션이 켜져 있을 때 작가가 다른 책을 제외해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "아티스트 매치 1", ["작가 A"]),
      createMockBook(2, "아티스트 매치 2", ["작가 A"]),
      createMockBook(3, "아티스트 매치 3", ["작가 B"]),
    ];

    const result = await detectSeriesCandidates(books, {
      minBooks: 2,
      requireArtistMatch: true,
    });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(2);
    expect(candidate.books.map((b) => b.book.id)).toEqual([1, 2]);
    expect(result.processedBooks).toBe(2);
  });

  it("`requireArtistMatch`가 켜져있고 minBooks를 만족 못하면 시리즈를 감지하지 않아야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "아티스트 매치 1", ["작가 A"]),
      createMockBook(2, "아티스트 매치 2", ["작가 B"]),
      createMockBook(3, "아티스트 매치 3", ["작가 C"]),
    ];

    const result = await detectSeriesCandidates(books, {
      minBooks: 2,
      requireArtistMatch: true,
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("다양한 볼륨 지정자(vol, v, # 등)를 인식해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "다양한 포맷 vol. 1"),
      createMockBook(2, "다양한 포맷 v.2"),
      createMockBook(3, "다양한 포맷 #3"),
      createMockBook(4, "다양한 포맷 (4)"),
    ];

    const result = await detectSeriesCandidates(books);

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(4);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3, 4]);
  });

  it("시리즈 제목에 숫자가 있어도 마지막 숫자를 권 수로 인식해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "Project 2024 Vol. 1"),
      createMockBook(2, "Project 2024 2화"),
      createMockBook(3, "Project 2024 3"),
    ];

    const result = await detectSeriesCandidates(books);

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(3);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3]);
    expect(candidate.seriesName).toBe("Project 2024");
  });

  it("작가와 제목 유사도 기반으로 그룹화해야 합니다 (패턴 실패시)", async () => {
    const booksForSimilarity: Book[] = [
      createMockBook(10, "아티스트 시리즈 - 에피소드 알파", ["유사 작가"]),
      createMockBook(11, "아티스트 시리즈 - 에피소드 베타", ["유사 작가"]),
      createMockBook(12, "다른 작가 시리즈", ["다른 작가"]),
    ];

    // 신뢰도 임계값을 낮춰서 작가 매칭만으로도 그룹화되도록 함
    const result = await detectSeriesCandidates(booksForSimilarity, {
      minConfidence: 0.5,
    });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    // localeCompare 한글 정렬: ㅂ(베타) < ㅇ(알파) 이므로 베타가 먼저 정렬됨
    // 비교 기반 그룹화에서는 공통 접두사가 "아티스트 시리즈 - 에피소드"로 추출됨
    expect(candidate.seriesName).toBe("아티스트 시리즈 - 에피소드");
    expect(candidate.books).toHaveLength(2);
    expect(candidate.books.map((b) => b.book.id).sort()).toEqual([10, 11]);
    expect(
      candidate.detectionReason.some((r) => r.type === "artist_match"),
    ).toBe(true);
  });

  it("minBooks 옵션을 존중하여 최소 책 개수 미만이면 시리즈를 생성하지 않아야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "작은 시리즈 1"),
      createMockBook(2, "작은 시리즈 2"),
    ];

    const result = await detectSeriesCandidates(books, { minBooks: 3 });
    expect(result.candidates).toHaveLength(0);

    const result2 = await detectSeriesCandidates(books, { minBooks: 2 });
    expect(result2.candidates).toHaveLength(1);
    expect(result2.candidates[0].books).toHaveLength(2);
  });

  it("'화' 단위로 끝나는 한국어 시리즈를 감지해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "웹툰 시리즈 1화"),
      createMockBook(2, "웹툰 시리즈 2화"),
      createMockBook(3, "웹툰 시리즈 3화"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.seriesName).toBe("웹툰 시리즈");
    expect(candidate.books).toHaveLength(3);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3]);
  });

  it("원 문자(①, ②)를 포함하는 시리즈를 감지해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "특수기호 시리즈 ①"),
      createMockBook(2, "특수기호 시리즈 ②"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.seriesName).toBe("특수기호 시리즈");
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2]);
  });

  it("한글 순서(상, 하)를 포함하는 시리즈를 감지해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "순서 시리즈 (상)"),
      createMockBook(2, "순서 시리즈 (하)"),
    ];

    // '상', '하'는 titlePatternMatcher에서 각각 1, 3으로 매핑되어 있음
    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.seriesName).toBe("순서 시리즈");
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 3]);
  });

  it("'|' 기호로 분리된 제목의 한글 부분을 우선하여 시리즈를 감지해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "My Series | 나의 시리즈 1"),
      createMockBook(2, "My Awesome Series | 나의 시리즈 2"),
      createMockBook(3, "Another Series"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    // 파싱 시 '나의 시리즈'를 접두어로 사용
    expect(candidate.seriesName).toBe("나의 시리즈");
    expect(candidate.books).toHaveLength(2);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2]);
  });

  it("시리즈의 외전이나 오마케를 시리즈의 마지막에 포함해야 합니다", async () => {
    // 주의: 시리즈명에 "외전"이 포함되면 안 됨 (파싱 오류 방지)
    const books: Book[] = [
      createMockBook(1, "스페셜 시리즈 1"),
      createMockBook(2, "스페셜 시리즈 2"),
      createMockBook(3, "스페셜 시리즈 외전"),
      createMockBook(4, "스페셜 시리즈 오마케"),
    ];

    const result = await detectSeriesCandidates(books);

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(4);
    expect(candidate.seriesName).toBe("스페셜 시리즈");
    // 정렬 순서: 권 번호 우선, 그 다음 제목순
    expect(candidate.books.map((b) => b.book.title)).toEqual([
      "스페셜 시리즈 1",
      "스페셜 시리즈 2",
      "스페셜 시리즈 오마케", // 'ㅇ'
      "스페셜 시리즈 외전", // 'ㅇ' 다음 'ㅈ'
    ]);
    expect(candidate.books[0].volumeNumber).toBe(1);
    expect(candidate.books[1].volumeNumber).toBe(2);
    expect(candidate.books[2].volumeNumber).toBe(null);
    expect(candidate.books[3].volumeNumber).toBe(null);
  });

  it("부제가 붙어 제목 끝에 숫자가 오지 않는 시리즈를 올바르게 분석하고 정렬해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "JK Kuppuku Kousoku 2 ~Aikidou Shoujo ga Maketa Hi~", [
        "Artist X",
      ]),
      createMockBook(
        2,
        "JK Kuppuku Kousoku 3 ~Aikidou Shoujo ga Maketa Hi~ | JK굴복구속3 ~합기도 소녀가 패배한 날~",
        ["Artist X"],
      ),
      createMockBook(
        3,
        "JK Kuppuku Kousoku ~Aikidou Shoujo ga Maketa Hi~ | JK 굴복 조교 ~합기도 소녀가 패배한 날~",
        ["Artist X"],
      ),
    ];

    // 신뢰도 문제로 후보에서 제외되지 않도록 임계값을 낮춤
    const result = await detectSeriesCandidates(books, { minConfidence: 0.1 });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books).toHaveLength(3);

    // 정렬 후 책 ID의 순서가 1권, 2권, 3권 순서여야 함
    expect(candidate.books.map((b) => b.book.id)).toEqual([3, 1, 2]);

    // 각 책의 권 번호가 올바르게 인식되었는지 확인
    const vol1 = candidate.books.find((b) => b.book.id === 3);
    const vol2 = candidate.books.find((b) => b.book.id === 1);
    const vol3 = candidate.books.find((b) => b.book.id === 2);

    expect(vol1?.volumeNumber).toBe(1);
    expect(vol2?.volumeNumber).toBe(2);
    expect(vol3?.volumeNumber).toBe(3);
  });

  it("orderIndex가 정렬 순서와 일치해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "순서 테스트 3"),
      createMockBook(2, "순서 테스트 1"),
      createMockBook(3, "순서 테스트 2"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    // 정렬 후 orderIndex가 1, 2, 3 순서여야 함
    expect(candidate.books.map((b) => b.orderIndex)).toEqual([1, 2, 3]);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3]);
    expect(candidate.books.map((b) => b.book.id)).toEqual([2, 3, 1]);
  });

  it("외전/오마케가 포함된 시리즈의 orderIndex가 올바르게 매겨져야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "정렬 시리즈 1"),
      createMockBook(2, "정렬 시리즈 2"),
      createMockBook(3, "정렬 시리즈 외전"),
      createMockBook(4, "정렬 시리즈 오마케"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    // 모든 orderIndex가 정렬 순서와 일치해야 함
    expect(candidate.books.map((b) => b.orderIndex)).toEqual([1, 2, 3, 4]);
    // 권 번호 있는 책이 먼저, 없는 책이 제목순으로 뒤에
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([
      1,
      2,
      null,
      null,
    ]);
  });

  it("동일 접두어를 가진 대량의 책을 올바르게 그룹화해야 합니다", async () => {
    const books: Book[] = Array.from({ length: 10 }, (_, i) =>
      createMockBook(i + 1, `긴 시리즈 ${i + 1}`),
    );

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books).toHaveLength(10);
    expect(result.candidates[0].books.map((b) => b.volumeNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("비슷하지만 다른 시리즈를 구분해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "시리즈 A 1"),
      createMockBook(2, "시리즈 A 2"),
      createMockBook(3, "시리즈 B 1"),
      createMockBook(4, "시리즈 B 2"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].books).toHaveLength(2);
    expect(result.candidates[1].books).toHaveLength(2);
  });

  it("EP/ep 패턴을 인식해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "에피소드 EP 1"),
      createMockBook(2, "에피소드 EP 2"),
      createMockBook(3, "에피소드 EP 3"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books.map((b) => b.volumeNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it("동일 작가의 시리즈가 작가 매칭 없이도 감지되어야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "작가 시리즈 1", ["공통 작가"]),
      createMockBook(2, "작가 시리즈 2", ["공통 작가"]),
      createMockBook(3, "작가 시리즈 3", ["공통 작가"]),
    ];

    // requireArtistMatch=false (기본값) 이어도 제목 패턴으로 감지
    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books).toHaveLength(3);
  });

  it("대괄호로 시리즈명이 표시된 경우를 인식해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "[작가명] 시리즈 1화"),
      createMockBook(2, "[작가명] 시리즈 2화"),
      createMockBook(3, "[작가명] 시리즈 3화"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books).toHaveLength(3);
    expect(result.candidates[0].books.map((b) => b.volumeNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it("두 자리 숫자 권수를 올바르게 인식해야 합니다", async () => {
    const books: Book[] = [
      createMockBook(1, "긴 시리즈 09"),
      createMockBook(2, "긴 시리즈 10"),
      createMockBook(3, "긴 시리즈 11"),
    ];

    const result = await detectSeriesCandidates(books);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books.map((b) => b.volumeNumber)).toEqual([
      9, 10, 11,
    ]);
  });
});

describe("seriesDetector/detectSeriesForBook", () => {
  const allBooks: Book[] = [
    createMockBook(1, "증분 시리즈 1", ["작가 A"]),
    createMockBook(2, "증분 시리즈 2", ["작가 A"]),
    createMockBook(3, "증분 시리즈 3", ["작가 B"]),
    createMockBook(4, "다른 시리즈 1"),
    createMockBook(10, "Standalone Book"),
  ];

  it("대상 책이 속한 시리즈 후보를 올바르게 찾아야 합니다", async () => {
    const targetBook = allBooks[0]; // '증분 시리즈 1'
    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minConfidence: 0.1,
    });

    expect(candidate).not.toBeNull();
    // parseTitlePattern('증분 시리즈 1')의 결과 prefix는 '증분 시리즈'
    expect(candidate!.seriesName).toBe("증분 시리즈");
    // requireArtistMatch가 기본적으로 false이므로 작가 B의 책도 포함
    expect(candidate!.books).toHaveLength(3);
    expect(candidate!.books.map((b) => b.book.id).sort()).toEqual([1, 2, 3]);
  });

  it("`requireArtistMatch` 옵션이 켜져있을 때 작가가 다른 책을 제외해야 합니다", async () => {
    const targetBook = allBooks[0]; // '증분 시리즈 1'
    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      requireArtistMatch: true,
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.seriesName).toBe("증분 시리즈");
    expect(candidate!.books).toHaveLength(2);
    expect(candidate!.books.map((b) => b.book.id).sort()).toEqual([1, 2]);
  });

  it("시리즈를 찾을 수 없으면 null을 반환해야 합니다", async () => {
    const targetBook = allBooks[4]; // 'Standalone Book'
    const candidate = await detectSeriesForBook(targetBook, allBooks);

    expect(candidate).toBeNull();
  });

  it("`minBooks` 조건을 만족하지 못하면 null을 반환해야 합니다", async () => {
    const targetBook = allBooks[0]; // '증분 시리즈 1'
    // 작가 매칭 시 시리즈는 2권이 되므로, minBooks: 3 조건에서 실패해야 함
    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minBooks: 3,
      requireArtistMatch: true,
    });

    expect(candidate).toBeNull();
  });

  it("대상 책의 제목 패턴 신뢰도가 낮으면 null을 반환해야 합니다", async () => {
    // 'parseTitlePattern'은 숫자 없는 제목에 낮은 신뢰도를 부여함
    const lowConfidenceBook = createMockBook(99, "이건 시리즈일 리가 없어");
    const candidate = await detectSeriesForBook(lowConfidenceBook, allBooks);

    expect(candidate).toBeNull();
  });

  it("권수가 있는 책이 먼저 정렬되고, 권수가 없는 책은 제목순으로 뒤에 정렬되어야 합니다", async () => {
    const targetBook = createMockBook(1, "정렬 테스트 2");
    const allBooks = [
      targetBook,
      createMockBook(2, "정렬 테스트 외전"),
      createMockBook(3, "정렬 테스트 1"),
    ];

    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minConfidence: 0.1,
    });

    expect(candidate).not.toBeNull();
    // 정렬 순서: 1권 → 2권 → 외전(null)
    expect(candidate!.books.map((b) => b.book.id)).toEqual([3, 1, 2]);
  });

  it("정렬 후 orderIndex가 1부터 순차적으로 매겨져야 합니다", async () => {
    // 불연속 권수(5, 10)로 volumeNumber != orderIndex 상황 유도
    const targetBook = createMockBook(1, "순서책 10");
    const allBooks = [
      targetBook,
      createMockBook(2, "순서책 5"),
      createMockBook(3, "순서책 오마케"),
    ];

    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minConfidence: 0.1,
    });

    expect(candidate).not.toBeNull();
    // 정렬 순서: 5권 → 10권 → 오마케(null)
    expect(candidate!.books.map((b) => b.book.id)).toEqual([2, 1, 3]);
    // orderIndex는 정렬 순서 기반 1, 2, 3 이어야 함 (volumeNumber 5, 10과 무관)
    expect(candidate!.books.map((b) => b.orderIndex)).toEqual([1, 2, 3]);
    expect(candidate!.books.map((b) => b.volumeNumber)).toEqual([5, 10, null]);
  });

  it("1권이 명시적으로 없을 때, 권 번호 없는 책을 1권으로 처리해야 합니다", async () => {
    const targetBook = createMockBook(1, "NoVol Series 2");
    const allBooks = [
      targetBook,
      createMockBook(2, "NoVol Series"), // 권수 없음 → 1권으로 처리
      createMockBook(3, "NoVol Series 3"),
    ];

    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minConfidence: 0.1,
    });

    expect(candidate).not.toBeNull();
    const noVolBook = candidate!.books.find(
      (b) => b.book.title === "NoVol Series",
    );
    expect(noVolBook?.volumeNumber).toBe(1);
    expect(noVolBook?.orderIndex).toBe(1);
  });

  it("물결표가 포함된 긴 제목의 권수 없는 책이 1권으로 정렬되어야 합니다", async () => {
    const targetBook = createMockBook(
      1,
      "Test Title ~Subtitle A~ 테스트 ~부제 설명~",
    );
    const allBooks = [
      targetBook,
      createMockBook(2, "Test Title 2 ~Subtitle A~ 테스트 2 ~부제 설명~"),
      createMockBook(3, "Test Title 3 ~Subtitle A~ 테스트 3 ~부제 설명~"),
      createMockBook(4, "test title 4 ~Subtitle A~ 테스트 4 ~부제 설명~"),
    ];

    const candidate = await detectSeriesForBook(targetBook, allBooks, {
      minConfidence: 0.1,
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.books[0].book.id).toBe(1);
    expect(candidate!.books[0].volumeNumber).toBe(1);
    expect(candidate!.books[0].orderIndex).toBe(1);
    expect(candidate!.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3, 4]);
  });

  it("detectSeriesCandidates에서 입력 순서와 무관하게 올바르게 정렬되어야 합니다", async () => {
    const books: Book[] = [
      createMockBook(4, "test title 4 ~Subtitle A~ 테스트 4 ~부제 설명~"),
      createMockBook(1, "Test Title ~Subtitle A~ 테스트 ~부제 설명~"),
      createMockBook(3, "Test Title 3 ~Subtitle A~ 테스트 3 ~부제 설명~"),
      createMockBook(2, "Test Title 2 ~Subtitle A~ 테스트 2 ~부제 설명~"),
    ];

    const result = await detectSeriesCandidates(books, { minConfidence: 0.1 });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.books.map((b) => b.book.id)).toEqual([1, 2, 3, 4]);
    expect(candidate.books.map((b) => b.volumeNumber)).toEqual([1, 2, 3, 4]);
    expect(candidate.books.map((b) => b.orderIndex)).toEqual([1, 2, 3, 4]);
  });
});

describe("seriesDetector/detectSeriesCandidates - Pass 2 대소문자", () => {
  it("작가명의 대소문자가 달라도 같은 작가로 그룹화해야 합니다 (Pass 2)", async () => {
    const books: Book[] = [
      createMockBook(1, "케이스 시리즈 - 알파", ["Artist A"]),
      createMockBook(2, "케이스 시리즈 - 베타", ["artist a"]),
    ];

    // Pass 2 경로: 제목 패턴으로 매칭 실패 후 작가+유사도로 그룹화
    const result = await detectSeriesCandidates(books, { minConfidence: 0.5 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].books).toHaveLength(2);
  });
});

describe("seriesDetector/detectSeriesIncremental", () => {
  it("기존 시리즈에 새 책을 추가해야 합니다", async () => {
    const mockIndex = {
      addBook: vi.fn().mockReturnValue({
        prefix: "시리즈",
        existingBookIds: [1, 2],
        seriesId: 42, // 기존 시리즈 ID
      }),
    };

    const newBooks = [createMockBook(3, "시리즈 3")];
    const result = await detectSeriesIncremental(newBooks, mockIndex);

    expect(result.addedToExisting).toBe(1);
    expect(result.newSeriesCreated).toBe(0);
    expect(result.unmatched).toBe(0);
  });

  it("새 시리즈를 생성해야 합니다 (기존 미할당 책과 매칭)", async () => {
    const callCount = { value: 0 };
    const mockIndex = {
      addBook: vi.fn().mockImplementation(() => {
        callCount.value++;
        // 첫 번째 책: 매칭 없음, 새 접두사
        if (callCount.value === 1) {
          return { prefix: "새시리즈", existingBookIds: [1], seriesId: null };
        }
        // 두 번째 책: 같은 접두사, 매칭 있음
        return { prefix: "새시리즈", existingBookIds: [1], seriesId: null };
      }),
    };

    const newBooks = [
      createMockBook(2, "새시리즈 1"),
      createMockBook(3, "새시리즈 2"),
    ];
    const result = await detectSeriesIncremental(newBooks, mockIndex, {
      minBooks: 2,
    });

    expect(result.newSeriesCreated).toBe(1);
    expect(result.addedToExisting).toBe(0);
  });

  it("매칭되지 않은 책은 unmatched로 카운트해야 합니다", async () => {
    const mockIndex = {
      addBook: vi.fn().mockReturnValue({
        prefix: "독립책",
        existingBookIds: [],
        seriesId: null,
      }),
    };

    const newBooks = [createMockBook(1, "완전 독립적인 제목")];
    const result = await detectSeriesIncremental(newBooks, mockIndex);

    expect(result.unmatched).toBe(1);
    expect(result.addedToExisting).toBe(0);
    expect(result.newSeriesCreated).toBe(0);
  });

  it("minBooks 미만이면 새 시리즈를 생성하지 않아야 합니다", async () => {
    const mockIndex = {
      addBook: vi.fn().mockReturnValue({
        prefix: "부족시리즈",
        existingBookIds: [],
        seriesId: null,
      }),
    };

    // minBooks=3이지만 같은 접두사 책이 2개뿐
    const newBooks = [
      createMockBook(1, "부족시리즈 1"),
      createMockBook(2, "부족시리즈 2"),
    ];
    const result = await detectSeriesIncremental(newBooks, mockIndex, {
      minBooks: 3,
    });

    expect(result.newSeriesCreated).toBe(0);
    expect(result.unmatched).toBe(2);
  });
});
