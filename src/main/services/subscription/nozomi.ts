/**
 * 태그별 nozomi 파일을 직접 받아 갤러리 ID 배열로 만든다.
 *
 * node-hitomi의 getGalleryIds를 쓰지 않는 이유: 그 함수는 검색어와 무관하게
 * 매 호출 index-all.nozomi 전량(실측 4.56MB / 1,196,065건)을 받아 Set으로 만든 뒤
 * 태그별 파일로 깎아낸다. reduce의 시드가 고정돼 있어 태그 유무로 피할 수 없다
 * (downloaderHandler.ts의 ID 캐시 주석도 같은 사실을 기록한다).
 *
 * 폴링은 "이 태그에 뭐가 새로 올라왔나"만 알면 되므로 태그 파일 하나면 충분하다.
 * 실측으로 artist 태그 기준 4.56MB → 1.0KB, 2,788ms → 575ms였고 결과는
 * 집합·순서 모두 getGalleryIds와 일치했다.
 *
 * URL은 반드시 hitomi.getNozomiUri로 만든다. 호스트·경로 규칙·언어 접미사처럼
 * 깨지기 쉬운 부분을 우리가 들고 있지 않기 위해서다.
 */
import https from "https";
import hitomi from "node-hitomi";
import type { Tag } from "node-hitomi";

/** 요청 타임아웃. 폴링은 급할 이유가 없어 넉넉히 잡는다 */
const REQUEST_TIMEOUT = 30_000;

/**
 * nozomi 파일은 big-endian Int32의 연속이다.
 * 4의 배수가 아니면 남는 바이트는 버린다 (잘린 응답 방어).
 */
export const parseNozomiIds = (buffer: Buffer): number[] => {
  const ids: number[] = [];
  for (let offset = 0; offset + 4 <= buffer.byteLength; offset += 4) {
    ids.push(buffer.readInt32BE(offset));
  }
  return ids;
};

/** 스킴 없는 URI("host/path")를 GET해서 본문 버퍼를 돌려준다 */
const requestBuffer = (uri: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const separator = uri.indexOf("/");
    const request = https.request(
      {
        hostname: uri.slice(0, separator),
        path: uri.slice(separator),
        method: "GET",
        port: 443,
        headers: {
          accept: "*/*",
          connection: "keep-alive",
          referer: "https://gold-usergeneratedcontent.net",
        },
      },
      (response) => {
        // 206은 Range 응답이다. 지금은 전량을 받지만 같이 허용해 둔다
        if (response.statusCode !== 200 && response.statusCode !== 206) {
          response.resume(); // 소켓을 비워야 keep-alive가 막히지 않는다
          reject(
            new Error(`nozomi 요청 실패 (HTTP ${response.statusCode}): ${uri}`),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let byteLength = 0;
        response
          .on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            byteLength += chunk.byteLength;
          })
          .once("error", reject)
          .once("end", () => resolve(Buffer.concat(chunks, byteLength)));
      },
    );

    request.setTimeout(REQUEST_TIMEOUT, () => {
      request.destroy(new Error(`nozomi 요청 시간 초과: ${uri}`));
    });
    request.once("error", reject).end();
  });

/** 태그 하나에 해당하는 갤러리 ID 전체를 받는다 */
export const fetchTagIds = async (tag: Tag): Promise<number[]> => {
  const uri = hitomi.getNozomiUri({ tag });
  return parseNozomiIds(await requestBuffer(uri));
};
