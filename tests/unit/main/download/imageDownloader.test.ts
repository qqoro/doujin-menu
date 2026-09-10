import { mkdtemp, readFile, readdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadImages } from "../../../../src/main/services/download/imageDownloader.js";

let targetDir: string;

beforeEach(async () => {
  targetDir = await mkdtemp(path.join(tmpdir(), "image-download-"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const okResponse = (body = "이미지") =>
  new Response(Buffer.from(body), { status: 200 });

/** 재시도 대기까지 실제로 기다리면 테스트가 느려집니다. */
const noDelay = () => 0;

describe("이미지 다운로드 루프", () => {
  it("URL 순서대로 번호를 매겨 저장한다", async () => {
    const result = await downloadImages({
      urls: ["https://x/a.webp", "https://x/b.png"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: async () => okResponse(),
    });

    expect(result.completed).toBe(true);
    expect((await readdir(targetDir)).sort()).toEqual([
      "000001.webp",
      "000002.png",
    ]);
  });

  it("확장자를 알 수 없으면 webp로 저장한다", async () => {
    await downloadImages({
      urls: ["https://gimel.mittere.io/0a1e97?v=1-abc"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: async () => okResponse(),
    });

    expect(await readdir(targetDir)).toEqual(["000001.webp"]);
  });

  it("이미 있는 파일은 다시 받지 않는다", async () => {
    // 이어받기입니다. 큰 글을 다시 시작할 때 처음부터 받으면 안 됩니다.
    await writeFile(path.join(targetDir, "000001.webp"), "기존");
    const fetchImpl = vi.fn(async () => okResponse("새로 받음"));

    await downloadImages({
      urls: ["https://x/a.webp", "https://x/b.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(targetDir, "000001.webp"), "utf8")).toBe(
      "기존",
    );
  });

  it("실패하면 다시 시도한다", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts < 3) return new Response("", { status: 500 });
      return okResponse();
    });

    const result = await downloadImages({
      urls: ["https://x/a.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl,
    });

    expect(result.completed).toBe(true);
    expect(attempts).toBe(3);
  });

  it("시도 상한을 넘으면 실패로 끝낸다", async () => {
    // 상한이 없으면 영구 404 파일 하나가 큐 전체를 붙잡습니다.
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));

    await expect(
      downloadImages({
        urls: ["https://x/a.webp"],
        targetDir,
        retryDelay: noDelay,
        maxAttempts: 3,
        fetchImpl,
      }),
    ).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("취소 신호가 오면 받다 말고 멈춘다", async () => {
    let downloaded = 0;
    const result = await downloadImages({
      urls: ["https://x/a.webp", "https://x/b.webp", "https://x/c.webp"],
      targetDir,
      retryDelay: noDelay,
      shouldCancel: () => downloaded >= 2,
      fetchImpl: async () => {
        downloaded++;
        return okResponse();
      },
    });

    expect(result.completed).toBe(false);
    expect(result.cancelled).toBe(true);
    // 받아 둔 두 장은 남습니다. 다시 시작하면 이어받습니다.
    expect(await readdir(targetDir)).toHaveLength(2);
  });

  it("진행 상황을 받은 장수와 함께 알린다", async () => {
    const progress: number[] = [];

    await downloadImages({
      urls: ["https://x/a.webp", "https://x/b.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: async () => okResponse(),
      onProgress: (downloaded, total) => {
        progress.push(downloaded);
        expect(total).toBe(2);
      },
    });

    expect(progress).toEqual([1, 2]);
  });
});

describe("서명 URL 만료 대응", () => {
  it("403이면 URL을 새로 받아 이어간다", async () => {
    // 서명 URL은 수명이 짧아 페이지가 많으면 받는 도중에 만료됩니다.
    const fresh = ["https://x/a2.webp", "https://x/b2.webp"];
    const refreshUrls = vi.fn(async () => fresh);
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("2.webp")
        ? okResponse()
        : new Response("Invalid Access Request", { status: 403 }),
    );

    const result = await downloadImages({
      urls: ["https://x/a.webp", "https://x/b.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshUrls,
    });

    expect(result.completed).toBe(true);
    expect(refreshUrls).toHaveBeenCalledTimes(1);
    expect(await readdir(targetDir)).toHaveLength(2);
  });

  it("403은 재시도가 아니라 갱신으로 처리한다", async () => {
    // 만료된 URL을 열 번 두드려 봐야 열 번 다 403입니다.
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("fresh") ? okResponse() : new Response("", { status: 403 }),
    );

    await downloadImages({
      urls: ["https://x/old.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshUrls: async () => ["https://x/fresh.webp"],
    });

    // 만료 URL 1회 + 갱신 URL 1회. 재시도로 돌면 훨씬 많아집니다.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("갱신해도 한 장도 못 받으면 끊는다", async () => {
    // 갱신 상한을 횟수로 고정하면 정상적인 긴 다운로드가 죽습니다. 진전이 없을 때만 끊습니다.
    const refreshUrls = vi.fn(async () => ["https://x/still-dead.webp"]);

    await expect(
      downloadImages({
        urls: ["https://x/dead.webp"],
        targetDir,
        retryDelay: noDelay,
        fetchImpl: async () => new Response("", { status: 403 }),
        refreshUrls,
      }),
    ).rejects.toThrow();

    expect(refreshUrls).toHaveBeenCalledTimes(2);
  });

  it("갱신 뒤 한 장이라도 받으면 다시 갱신할 수 있다", async () => {
    // 200장짜리를 느린 회선으로 받으면 갱신이 서너 번 일어나는 게 정상입니다.
    // 갱신 횟수를 고정 상한으로 막으면 그런 다운로드가 중간에 죽습니다.
    let generation = 0;
    const refreshUrls = vi.fn(async () => {
      generation++;
      return [
        `https://x/g${generation}-1.webp`,
        `https://x/g${generation}-2.webp`,
      ];
    });
    // 세대마다 한 장씩만 살아 있어 갱신이 두 번 필요합니다.
    const fetchImpl = vi.fn(async (url: string) =>
      url === "https://x/g1-1.webp" || url === "https://x/g2-2.webp"
        ? okResponse()
        : new Response("", { status: 403 }),
    );

    const result = await downloadImages({
      urls: ["https://x/old-1.webp", "https://x/old-2.webp"],
      targetDir,
      retryDelay: noDelay,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refreshUrls,
    });

    expect(result.completed).toBe(true);
    expect(refreshUrls).toHaveBeenCalledTimes(2);
    expect(await readdir(targetDir)).toHaveLength(2);
  });

  it("URL을 갱신할 방법이 없으면 403도 그냥 실패다", async () => {
    await expect(
      downloadImages({
        urls: ["https://x/a.webp"],
        targetDir,
        retryDelay: noDelay,
        maxAttempts: 2,
        fetchImpl: async () => new Response("", { status: 403 }),
      }),
    ).rejects.toThrow();
  });
});
