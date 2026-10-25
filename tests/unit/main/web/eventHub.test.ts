import { afterEach, describe, expect, it } from "vitest";
import {
  addWebClient,
  createWebSender,
  publishWeb,
  publishWebTo,
} from "../../../../src/main/web/eventHub.js";

const makeClient = (id: string) => {
  const chunks: string[] = [];
  return { id, chunks, write: (chunk: string) => chunks.push(chunk) };
};

describe("eventHub", () => {
  const removers: Array<() => void> = [];

  afterEach(() => {
    removers.splice(0).forEach((remove) => remove());
  });

  it("publishWeb은 모든 클라이언트에 SSE 프레임을 쓴다", () => {
    const a = makeClient("a");
    const b = makeClient("b");
    removers.push(addWebClient(a), addWebClient(b));

    publishWeb("books-updated");

    const frame = 'data: {"channel":"books-updated"}\n\n';
    expect(a.chunks).toEqual([frame]);
    expect(b.chunks).toEqual([frame]);
  });

  it("publishWebTo는 지정한 클라이언트에만 쓴다", () => {
    const a = makeClient("a");
    const b = makeClient("b");
    removers.push(addWebClient(a), addWebClient(b));

    publishWebTo("b", "download-progress", {
      galleryId: 1,
      status: "starting",
    });

    expect(a.chunks).toEqual([]);
    expect(b.chunks).toEqual([
      'data: {"channel":"download-progress","payload":{"galleryId":1,"status":"starting"}}\n\n',
    ]);
  });

  it("제거한 클라이언트에는 더 이상 쓰지 않는다", () => {
    const a = makeClient("a");
    const remove = addWebClient(a);
    remove();

    publishWeb("books-updated");

    expect(a.chunks).toEqual([]);
  });

  it("createWebSender의 send는 그 클라이언트에만 보낸다", () => {
    const a = makeClient("a");
    const b = makeClient("b");
    removers.push(addWebClient(a), addWebClient(b));

    createWebSender("a").send("info-generation-progress", {
      total: 2,
      current: 1,
      message: "x",
    });

    expect(a.chunks).toHaveLength(1);
    expect(a.chunks[0]).toContain('"channel":"info-generation-progress"');
    expect(b.chunks).toEqual([]);
  });
});
