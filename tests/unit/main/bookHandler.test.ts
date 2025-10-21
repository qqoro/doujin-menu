import { describe, expect, it } from "vitest";

describe("bookHandler", () => {
  describe("createKoreanRegexp", () => {
    // 한국어 제목 추출 정규식 테스트
    const createKoreanRegexp = () => /^.+\|\s?(.+)$/;

    it("'영어 | 한글' 형식에서 한글 부분을 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English Title | 한글 제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글 제목");
    });

    it("'영어|한글' 형식 (공백 없음)에서도 한글 부분을 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English Title|한글제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글제목");
    });

    it("파이프가 없는 제목은 매칭되지 않아야 함", () => {
      const regex = createKoreanRegexp();
      const title = "Only English Title";
      const match = regex.exec(title);

      expect(match).toBeNull();
    });

    it("파이프만 있고 뒤에 텍스트가 없으면 매칭되지 않음", () => {
      const regex = createKoreanRegexp();
      const title = "English Title |";
      const match = regex.exec(title);

      // 정규식 /^.+\|\s?(.+)$/는 파이프 뒤에 최소 1개 이상의 문자가 필요함
      expect(match).toBeNull();
    });

    it("파이프가 여러 개 있으면 마지막 파이프 이후를 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "Part1 | Part2 | 한글제목";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글제목");
    });

    it("한글 부분에 공백이 있어도 제대로 추출해야 함", () => {
      const regex = createKoreanRegexp();
      const title = "English | 한글 제목 테스트";
      const match = regex.exec(title);

      expect(match).not.toBeNull();
      expect(match![1]).toBe("한글 제목 테스트");
    });
  });

  describe("검색 쿼리 파싱 로직", () => {
    // 검색 쿼리 파싱 정규식
    const prefixedTermRegex =
      /(id|artist|group|type|language|series|character|tag):(.+?)(?=\s*(?:id|artist|group|type|language|series|character|tag|male|female):|$)/g;

    it("'artist:작가명' 형식을 올바르게 파싱해야 함", () => {
      const query = "artist:작가1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
    });

    it("'tag:태그명' 형식을 올바르게 파싱해야 함", () => {
      const query = "tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("tag");
      expect(matches[0][2]).toBe("태그1");
    });

    it("여러 프리픽스를 포함한 쿼리를 파싱해야 함", () => {
      const query = "artist:작가1 tag:태그1 type:만화";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(3);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
      expect(matches[2][1]).toBe("type");
      expect(matches[2][2]).toBe("만화");
    });

    it("'id:123' 형식을 올바르게 파싱해야 함", () => {
      const query = "id:12345";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("id");
      expect(matches[0][2]).toBe("12345");
    });

    it("'series:시리즈명' 형식을 올바르게 파싱해야 함", () => {
      const query = "series:시리즈1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("series");
      expect(matches[0][2]).toBe("시리즈1");
    });

    it("'group:그룹명' 형식을 올바르게 파싱해야 함", () => {
      const query = "group:그룹1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("group");
      expect(matches[0][2]).toBe("그룹1");
    });

    it("'character:캐릭터명' 형식을 올바르게 파싱해야 함", () => {
      const query = "character:캐릭터1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("character");
      expect(matches[0][2]).toBe("캐릭터1");
    });

    it("'language:언어명' 형식을 올바르게 파싱해야 함", () => {
      const query = "language:korean";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("language");
      expect(matches[0][2]).toBe("korean");
    });

    it("프리픽스 없는 텍스트는 매칭되지 않아야 함", () => {
      const query = "일반 검색어";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(0);
    });

    it("프리픽스와 일반 텍스트가 섞인 쿼리를 파싱해야 함", () => {
      const query = "일반검색 artist:작가1 태그검색";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("artist");
      // 정규식은 다음 프리픽스나 문자열 끝까지 매칭하므로 "작가1 태그검색"이 됨
      expect(matches[0][2]).toBe("작가1 태그검색");
    });

    it("공백 없이 연속된 프리픽스를 파싱해야 함", () => {
      const query = "artist:작가1tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가1");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
    });

    it("프리픽스 값에 공백이 포함되어도 다음 프리픽스 전까지 파싱해야 함", () => {
      const query = "artist:작가 이름 tag:태그1";
      const matches = Array.from(query.matchAll(prefixedTermRegex));

      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("artist");
      expect(matches[0][2]).toBe("작가 이름");
      expect(matches[1][1]).toBe("tag");
      expect(matches[1][2]).toBe("태그1");
    });
  });

  describe("male/female 태그 파싱", () => {
    it("'male:태그' 형식을 인식해야 함", () => {
      const term = "male:근육";
      expect(term.startsWith("male:")).toBe(true);
      expect(term.split(":")[1]).toBe("근육");
    });

    it("'female:태그' 형식을 인식해야 함", () => {
      const term = "female:안경";
      expect(term.startsWith("female:")).toBe(true);
      expect(term.split(":")[1]).toBe("안경");
    });

    it("일반 태그는 male/female로 시작하지 않아야 함", () => {
      const term = "일반태그";
      expect(term.startsWith("male:")).toBe(false);
      expect(term.startsWith("female:")).toBe(false);
    });
  });

  describe("제목 변환 로직 (prioritizeKoreanTitles)", () => {
    const createKoreanRegexp = () => /^.+\|\s?(.+)$/;

    it("prioritizeKoreanTitles가 활성화되면 한글 부분만 반환해야 함", () => {
      const title = "English Title | 한글 제목";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("한글 제목");
    });

    it("prioritizeKoreanTitles가 비활성화되면 원본 제목을 유지해야 함", () => {
      const title = "English Title | 한글 제목";
      const prioritizeKoreanTitles = false;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("English Title | 한글 제목");
    });

    it("파이프가 없는 제목은 그대로 유지해야 함", () => {
      const title = "Only English Title";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("Only English Title");
    });

    it("한글 부분에 공백이 있으면 trim 처리되어야 함", () => {
      const title = "English |  한글 제목  ";
      const prioritizeKoreanTitles = true;

      let displayTitle = title;
      if (prioritizeKoreanTitles) {
        const koreanPart = createKoreanRegexp().exec(title);
        if (koreanPart?.[1]) {
          displayTitle = koreanPart[1].trim();
        }
      }

      expect(displayTitle).toBe("한글 제목");
    });
  });
});
