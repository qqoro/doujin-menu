import { parentPort } from "worker_threads";
import type { Book } from "../db/types.js";
import { detectSeriesCandidates } from "../services/seriesDetection/seriesDetector.js";
import type { DetectionOptions } from "../services/seriesDetection/types.js";

if (parentPort) {
  parentPort.on(
    "message",
    async (msg: { books: Book[]; options: Partial<DetectionOptions> }) => {
      try {
        const { books, options } = msg;

        // CPU 집약적인 작업 수행
        const result = await detectSeriesCandidates(books, options);

        parentPort?.postMessage({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[Worker] 시리즈 감지 실패:", error);
        parentPort?.postMessage({
          success: false,
          error: (error as Error).message,
        });
      }
    },
  );
}
