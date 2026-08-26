import { EventEmitter } from "events";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// https.request 스파이. 테스트마다 응답을 갈아끼운다.
// 빌트인은 "https"와 "node:https" 양쪽으로 해석될 수 있어 둘 다 막는다.
// 하나라도 새면 실제 요청이 나가 테스트가 타임아웃으로 죽는다.
// 팩토리는 반드시 인라인으로 둔다. vi.mock이 hoist되므로 밖에 뽑아 놓으면
// 선언보다 먼저 참조되어 TDZ 에러가 난다. 팩토리 "본문"의 mockRequest 참조는
// 실제 import 시점에 평가되므로 안전하다.
const mockRequest = vi.fn();
vi.mock("https", () => ({
  default: { request: (...args: unknown[]) => mockRequest(...args) },
  request: (...args: unknown[]) => mockRequest(...args),
}));
vi.mock("node:https", () => ({
  default: { request: (...args: unknown[]) => mockRequest(...args) },
  request: (...args: unknown[]) => mockRequest(...args),
}));

// node-hitomi 부분 모킹: getNozomiUri만 스텁, getParsedTags는 진짜를 쓴다
const mockGetNozomiUri = vi.fn();
vi.mock("node-hitomi", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = (actual.default ?? actual) as Record<string, unknown>;
  const mocked = { ...real, getNozomiUri: mockGetNozomiUri };
  return { ...mocked, default: mocked };
});

const { parseNozomiIds, fetchTagIds } =
  await import("../../../../src/main/services/subscription/nozomi.js");

/** big-endian Int32 배열을 버퍼로 만든다 */
const toBuffer = (ids: number[]): Buffer => {
  const buffer = Buffer.alloc(ids.length * 4);
  ids.forEach((id, i) => buffer.writeInt32BE(id, i * 4));
  return buffer;
};

/**
 * https.request를 흉내낸다. 콜백에 스트림 응답을 넘기고,
 * setTimeout/once/end를 가진 요청 객체를 돌려준다.
 */
const stubResponse = (statusCode: number, body: Buffer) => {
  mockRequest.mockImplementation(
    (
      _options: unknown,
      callback: (res: Readable & { statusCode: number }) => void,
    ) => {
      // resume은 절대 덮어쓰지 않는다. Readable은 .on("data")가 붙을 때
      // 내부적으로 resume()을 불러 흐름을 시작하므로, no-op으로 바꾸면
      // data/end가 영원히 오지 않는다
      const res = Readable.from([body]) as Readable & { statusCode: number };
      res.statusCode = statusCode;

      const req = new EventEmitter() as EventEmitter & {
        setTimeout: (ms: number, cb: () => void) => void;
        destroy: (err?: Error) => void;
        end: () => void;
      };
      req.setTimeout = () => {};
      req.destroy = () => {};
      req.end = () => {
        // 실제 https처럼 end() 이후에 응답이 온다
        setImmediate(() => callback(res));
      };
      return req;
    },
  );
};

describe("parseNozomiIds", () => {
  it("4바이트씩 big-endian으로 읽는다", () => {
    expect(parseNozomiIds(toBuffer([4117695, 4079011, 4072685]))).toEqual([
      4117695, 4079011, 4072685,
    ]);
  });

  it("빈 버퍼는 빈 배열", () => {
    expect(parseNozomiIds(Buffer.alloc(0))).toEqual([]);
  });

  it("4의 배수가 아니면 남는 바이트를 버린다", () => {
    // 12바이트(3건) + 1바이트
    const buffer = Buffer.concat([toBuffer([1, 2, 3]), Buffer.from([0xff])]);
    expect(parseNozomiIds(buffer)).toEqual([1, 2, 3]);
  });
});

describe("fetchTagIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNozomiUri.mockReturnValue(
      "ltn.gold-usergeneratedcontent.net/n/artist/foo-all.nozomi",
    );
  });

  it("getNozomiUri가 만든 URL로 요청한다 (직접 조립하지 않는다)", async () => {
    stubResponse(200, toBuffer([10, 20]));

    await fetchTagIds({ type: "artist", name: "foo" });

    expect(mockGetNozomiUri).toHaveBeenCalledWith({
      tag: { type: "artist", name: "foo" },
    });

    const options = mockRequest.mock.calls[0][0] as {
      hostname: string;
      path: string;
    };
    expect(options.hostname).toBe("ltn.gold-usergeneratedcontent.net");
    expect(options.path).toBe("/n/artist/foo-all.nozomi");
  });

  it("응답 버퍼를 ID 배열로 돌려준다", async () => {
    stubResponse(200, toBuffer([4117695, 4079011]));

    await expect(fetchTagIds({ type: "artist", name: "foo" })).resolves.toEqual(
      [4117695, 4079011],
    );
  });

  it("206도 성공으로 본다", async () => {
    stubResponse(206, toBuffer([1]));

    await expect(fetchTagIds({ type: "artist", name: "foo" })).resolves.toEqual(
      [1],
    );
  });

  it("404면 거부한다", async () => {
    stubResponse(404, Buffer.alloc(0));

    await expect(fetchTagIds({ type: "artist", name: "foo" })).rejects.toThrow(
      /404/,
    );
  });
});
