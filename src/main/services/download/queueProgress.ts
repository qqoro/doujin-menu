import { broadcast } from "../../utils/broadcast.js";

/** 큐 갱신 브로드캐스트 최소 간격(ms) */
const QUEUE_BROADCAST_INTERVAL = 200;

/**
 * 큐 행의 진행률을 갱신하고 모든 창에 알립니다.
 *
 * 이어받기로 수백 장을 건너뛸 때 창마다 큐를 다시 조회하지 않도록 쓰로틀합니다.
 * 마지막 장은 force로 반드시 반영합니다.
 */
export const createQueueProgressReporter = (queueId?: number) => {
  let lastBroadcast = 0;

  return async (downloaded: number, total: number) => {
    if (!queueId) return;

    const isLast = downloaded >= total;
    const now = Date.now();
    if (!isLast && now - lastBroadcast < QUEUE_BROADCAST_INTERVAL) return;
    lastBroadcast = now;

    const db = (await import("../../db/index.js")).default;
    await db("DownloadQueue")
      .where("id", queueId)
      .update({
        progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
        downloaded_files: downloaded,
      });
    broadcast("download-queue-updated");
  };
};
