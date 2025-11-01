import { ipcMain, BrowserWindow } from "electron";
import db from "../db/index.js";
import type { DownloadQueueItem, DownloadQueueStatus } from "../../types/ipc.js";
import { handleDownloadGallery } from "./downloaderHandler.js";
import fs from "fs/promises";
import path from "path";
import { store as configStore } from "./configHandler.js";
import hitomi from "node-hitomi";
import { filenamifyPath } from "filenamify";
import { formatDownloadFolderName } from "../utils/index.js";

// 다운로드 큐 처리 상태
let isProcessingQueue = false;
let currentDownloadId: number | null = null;
let shouldCancelCurrentDownload = false; // 현재 다운로드 취소 플래그

/**
 * 다운로드 큐 전체 목록 조회
 */
export const handleGetDownloadQueue = async () => {
  try {
    const queue = await db<DownloadQueueItem>("DownloadQueue")
      .select("*")
      .orderBy("priority", "desc")
      .orderBy("added_at", "asc");

    return { success: true, data: queue };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error getting download queue:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 큐에 항목 추가
 */
export const handleAddToDownloadQueue = async (params: {
  galleryId: number;
  galleryTitle: string;
  galleryArtist?: string;
  thumbnailUrl?: string;
  downloadPath: string;
}) => {
  try {
    // 이미 큐에 있는지 확인
    const existing = await db("DownloadQueue")
      .where("gallery_id", params.galleryId)
      .first();

    if (existing) {
      return {
        success: false,
        error: "이미 다운로드 큐에 존재합니다.",
      };
    }

    // 큐에 추가
    const [id] = await db("DownloadQueue").insert({
      gallery_id: params.galleryId,
      gallery_title: params.galleryTitle,
      gallery_artist: params.galleryArtist,
      thumbnail_url: params.thumbnailUrl,
      download_path: params.downloadPath,
      status: "pending",
      progress: 0,
      total_files: 0,
      downloaded_files: 0,
      download_speed: 0,
      priority: 0,
      added_at: new Date().toISOString(),
    });

    const newItem = await db<DownloadQueueItem>("DownloadQueue")
      .where("id", id)
      .first();

    // 큐 처리 시작 (현재 처리 중이 아니면)
    if (!isProcessingQueue) {
      processDownloadQueue();
    }

    // 모든 렌더러에 큐 업데이트 알림
    broadcastQueueUpdate();

    return { success: true, data: newItem };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error adding to download queue:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 큐에서 항목 제거
 */
export const handleRemoveFromDownloadQueue = async (queueId: number) => {
  try {
    const item = await db("DownloadQueue").where("id", queueId).first();

    if (!item) {
      return { success: false, error: "큐 항목을 찾을 수 없습니다." };
    }

    // 현재 다운로드 중인 항목은 삭제 불가
    if (item.status === "downloading") {
      return {
        success: false,
        error: "다운로드 중인 항목은 삭제할 수 없습니다. 먼저 일시정지하세요.",
      };
    }

    // 완료되지 않은 항목만 파일 삭제
    const shouldDeleteFiles = item.status !== "completed";

    if (shouldDeleteFiles && item.download_path) {
      try {
        // 갤러리 정보 가져오기
        const gallery = await hitomi.getGallery(item.gallery_id);
        if (gallery) {
          const downloadPattern = configStore.get(
            "downloadPattern",
            "%artist% - %title%",
          ) as string;

          // 유틸리티 함수 사용
          const folderName = formatDownloadFolderName(gallery, downloadPattern);

          const galleryDownloadPath = filenamifyPath(
            path.join(item.download_path, folderName),
            { maxLength: 255, replacement: "_" },
          );

          // 폴더 삭제
          try {
            await fs.rm(galleryDownloadPath, { recursive: true, force: true });
            console.log(`[DownloadQueue] 미완료 다운로드 파일 삭제됨: ${galleryDownloadPath}`);
          } catch (deleteError) {
            console.warn(`[DownloadQueue] 파일 삭제 실패 (무시):`, deleteError);
          }

          // 압축 파일도 삭제 시도
          const compressFormat = configStore.get("compressFormat", "cbz") as string;
          const archiveFilePath = `${galleryDownloadPath}.${compressFormat}`;
          try {
            await fs.unlink(archiveFilePath);
            console.log(`[DownloadQueue] 미완료 압축 파일 삭제됨: ${archiveFilePath}`);
          } catch {
            // 압축 파일이 없으면 무시
          }
        }
      } catch (error) {
        console.warn(`[DownloadQueue] 파일 삭제 중 오류 (계속 진행):`, error);
      }
    }

    await db("DownloadQueue").where("id", queueId).delete();

    broadcastQueueUpdate();

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error removing from download queue:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 일시정지
 */
export const handlePauseDownload = async (queueId: number) => {
  try {
    const item = await db("DownloadQueue").where("id", queueId).first();

    if (!item) {
      return { success: false, error: "큐 항목을 찾을 수 없습니다." };
    }

    if (item.status !== "downloading") {
      return {
        success: false,
        error: "다운로드 중인 항목만 일시정지할 수 있습니다.",
      };
    }

    // 현재 다운로드 중인 항목이면 취소 플래그 설정
    if (currentDownloadId === queueId) {
      shouldCancelCurrentDownload = true;

      // 취소 플래그를 설정했지만, 실제 다운로드가 멈출 때까지는
      // DB 상태를 즉시 변경하지 않습니다.
      // processDownloadQueue에서 취소를 감지하고 paused로 변경합니다.
      console.log(`[DownloadQueue] 일시정지 요청됨: ${queueId}`);
    } else {
      // 현재 다운로드 중이 아닌 경우 (이론상 발생하지 않아야 함)
      await db("DownloadQueue").where("id", queueId).update({
        status: "paused",
      });
      broadcastQueueUpdate();
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error pausing download:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 재개
 */
export const handleResumeDownload = async (queueId: number) => {
  try {
    const item = await db("DownloadQueue").where("id", queueId).first();

    if (!item) {
      return { success: false, error: "큐 항목을 찾을 수 없습니다." };
    }

    if (item.status !== "paused") {
      return {
        success: false,
        error: "일시정지된 항목만 재개할 수 있습니다.",
      };
    }

    await db("DownloadQueue").where("id", queueId).update({
      status: "pending",
    });

    broadcastQueueUpdate();

    // 큐 처리 시작
    if (!isProcessingQueue) {
      processDownloadQueue();
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error resuming download:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 재시도
 */
export const handleRetryDownload = async (queueId: number) => {
  try {
    const item = await db("DownloadQueue").where("id", queueId).first();

    if (!item) {
      return { success: false, error: "큐 항목을 찾을 수 없습니다." };
    }

    if (item.status !== "failed") {
      return {
        success: false,
        error: "실패한 항목만 재시도할 수 있습니다.",
      };
    }

    await db("DownloadQueue").where("id", queueId).update({
      status: "pending",
      progress: 0,
      downloaded_files: 0,
      error_message: null,
    });

    broadcastQueueUpdate();

    // 큐 처리 시작
    if (!isProcessingQueue) {
      processDownloadQueue();
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error retrying download:", error);
    return { success: false, error: message };
  }
};

/**
 * 완료된 다운로드 모두 제거
 */
export const handleClearCompletedDownloads = async () => {
  try {
    await db("DownloadQueue").where("status", "completed").delete();

    broadcastQueueUpdate();

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error clearing completed downloads:", error);
    return { success: false, error: message };
  }
};

/**
 * 다운로드 큐 상태 업데이트 (내부 함수)
 */
export const updateQueueItemStatus = async (
  queueId: number,
  status: DownloadQueueStatus,
  data?: {
    progress?: number;
    totalFiles?: number;
    downloadedFiles?: number;
    downloadSpeed?: number;
    errorMessage?: string;
  }
) => {
  try {
    const updateData: Partial<DownloadQueueItem> = { status };

    if (data?.progress !== undefined) updateData.progress = data.progress;
    if (data?.totalFiles !== undefined) updateData.total_files = data.totalFiles;
    if (data?.downloadedFiles !== undefined) updateData.downloaded_files = data.downloadedFiles;
    if (data?.downloadSpeed !== undefined) updateData.download_speed = data.downloadSpeed;
    if (data?.errorMessage !== undefined) updateData.error_message = data.errorMessage;

    if (status === "downloading" && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
      updateData.progress = 100;
    }

    await db("DownloadQueue").where("id", queueId).update(updateData);

    broadcastQueueUpdate();
  } catch (error) {
    console.error("Error updating queue item status:", error);
  }
};

/**
 * 다운로드 큐 처리 루프
 */
async function processDownloadQueue() {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (true) {
      // pending 상태인 다음 항목 가져오기
      const nextItem = await db<DownloadQueueItem>("DownloadQueue")
        .where("status", "pending")
        .orderBy("priority", "desc")
        .orderBy("added_at", "asc")
        .first();

      if (!nextItem) {
        // 더 이상 대기 중인 항목이 없음
        break;
      }

      currentDownloadId = nextItem.id;
      shouldCancelCurrentDownload = false; // 취소 플래그 초기화

      // 다운로드 시작
      await updateQueueItemStatus(nextItem.id, "downloading");

      try {
        // 메인 윈도우 가져오기
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
          throw new Error("메인 윈도우를 찾을 수 없습니다.");
        }

        // 다운로드 실행 (기존 downloaderHandler 사용)
        const result = await handleDownloadGallery(
          { sender: mainWindow.webContents } as any,
          {
            galleryId: nextItem.gallery_id,
            downloadPath: nextItem.download_path,
            queueId: nextItem.id, // 큐 ID 전달
            shouldCancel: () => shouldCancelCurrentDownload, // 취소 확인 함수
          }
        );

        // 일시정지 처리
        if (shouldCancelCurrentDownload || result.paused) {
          await updateQueueItemStatus(nextItem.id, "paused");
          console.log(`[DownloadQueue] 다운로드가 일시정지되었습니다: ${nextItem.gallery_id}`);
        } else if (result.success) {
          await updateQueueItemStatus(nextItem.id, "completed");
        } else {
          await updateQueueItemStatus(nextItem.id, "failed", {
            errorMessage: result.error || "다운로드 실패",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // 취소에 의한 에러가 아닌 경우만 실패로 처리
        if (!shouldCancelCurrentDownload) {
          await updateQueueItemStatus(nextItem.id, "failed", {
            errorMessage: message,
          });
        } else {
          // 취소된 경우 paused로 처리
          await updateQueueItemStatus(nextItem.id, "paused");
        }
      }

      currentDownloadId = null;
      shouldCancelCurrentDownload = false;

      // 잠시 대기 (다음 다운로드 전)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    // 큐 처리 루프 자체에서 예외 발생 (DB 연결 실패, 치명적 에러 등)
    console.error("[DownloadQueue] 큐 처리 중 치명적 에러 발생:", error);

    // 현재 다운로드 중이던 항목이 있으면 pending으로 되돌림
    if (currentDownloadId !== null) {
      try {
        await updateQueueItemStatus(currentDownloadId, "pending");
        console.log(`[DownloadQueue] 항목 ${currentDownloadId}을(를) pending으로 복구했습니다.`);
      } catch (updateError) {
        console.error(`[DownloadQueue] 항목 상태 복구 실패:`, updateError);
      }
    }
  } finally {
    isProcessingQueue = false;
    currentDownloadId = null;
    shouldCancelCurrentDownload = false;

    // 에러 발생 후 대기 중인 항목이 있는지 확인하고 자동 재시작
    try {
      const hasPending = await db<DownloadQueueItem>("DownloadQueue")
        .where("status", "pending")
        .first();

      if (hasPending) {
        console.log("[DownloadQueue] 대기 중인 항목이 있어 5초 후 큐 처리를 재시작합니다.");
        // 5초 후 재시작
        setTimeout(() => {
          processDownloadQueue();
        }, 5000);
      }
    } catch (error) {
      console.error("[DownloadQueue] 대기 항목 확인 실패:", error);
    }
  }
}

/**
 * 모든 렌더러에 큐 업데이트 브로드캐스트
 */
function broadcastQueueUpdate() {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    window.webContents.send("download-queue-updated");
  });
}

/**
 * 앱 시작 시 미완료 다운로드 복구
 */
export async function initializeDownloadQueue() {
  try {
    // downloading 상태인 항목만 pending으로 변경 (앱이 종료되었을 때)
    // paused 상태는 그대로 유지
    await db("DownloadQueue")
      .where("status", "downloading")
      .update({ status: "pending" });

    console.log("[DownloadQueue] 미완료 다운로드 복구 완료");

    // 큐 처리 시작
    processDownloadQueue();

    console.log("[DownloadQueue] 다운로드 큐 초기화 완료");
  } catch (error) {
    console.error("Error initializing download queue:", error);
  }
}

/**
 * 다운로드 큐 핸들러 등록
 */
export function registerDownloadQueueHandlers() {
  ipcMain.handle("get-download-queue", handleGetDownloadQueue);
  ipcMain.handle("add-to-download-queue", (_event, params) =>
    handleAddToDownloadQueue(params)
  );
  ipcMain.handle("remove-from-download-queue", (_event, queueId) =>
    handleRemoveFromDownloadQueue(queueId)
  );
  ipcMain.handle("pause-download", (_event, queueId) =>
    handlePauseDownload(queueId)
  );
  ipcMain.handle("resume-download", (_event, queueId) =>
    handleResumeDownload(queueId)
  );
  ipcMain.handle("retry-download", (_event, queueId) =>
    handleRetryDownload(queueId)
  );
  ipcMain.handle("clear-completed-downloads", handleClearCompletedDownloads);

  console.log("[DownloadQueue] 다운로드 큐 핸들러 등록 완료");
}
