import fs from "fs/promises";
import sharp from "sharp";
import { parentPort } from "worker_threads";

if (parentPort) {
  parentPort.on(
    "message",
    async (task: {
      sourcePath: string;
      thumbnailPath: string;
      bookId: number;
      tempPath: string;
      thumbnailDirPath: string;
    }) => {
      const { sourcePath, thumbnailPath, bookId, tempPath, thumbnailDirPath } =
        task;

      try {
        // 썸네일 디렉토리가 없으면 생성 (워커 스레드에서 직접 처리)
        await fs.mkdir(thumbnailDirPath, { recursive: true });

        // 원본 이미지를 버퍼로 읽어 sharp에 전달하여 파일 핸들 문제를 방지
        const imageBuffer = await fs.readFile(sourcePath);
        await sharp(imageBuffer).resize(512).webp().toFile(thumbnailPath);

        // 임시 파일이 있다면 삭제 (ZIP 파일에서 추출된 경우)
        if (sourcePath.startsWith(tempPath) && sourcePath !== thumbnailPath) {
          try {
            await fs.unlink(sourcePath);
          } catch (unlinkError) {
            // 임시 파일 삭제 실패는 치명적이지 않으므로 경고만 로깅
            console.warn(
              `[Worker] Failed to delete temporary source file ${sourcePath}:`,
              unlinkError,
            );
          }
        }

        parentPort?.postMessage({ status: "success", bookId, thumbnailPath });
      } catch (error) {
        console.error(
          `[Worker] Failed to generate thumbnail for book ${bookId}:`,
          error,
        );
        parentPort?.postMessage({
          status: "error",
          bookId,
          error: (error as Error).message,
        });
      }
    },
  );
}
