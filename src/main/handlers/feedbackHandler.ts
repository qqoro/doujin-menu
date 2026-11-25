import { app, ipcMain } from "electron";
import log from "electron-log";
import { readFile, stat, unlink } from "fs/promises";
import path from "path";
import type { FeedbackPayload, FeedbackResult } from "../../types/ipc.js";
import { buildDebugFilename, writeDebugArchive } from "./debugDataHandler.js";

const FEEDBACK_ENDPOINT =
  process.env.FEEDBACK_ENDPOINT ?? "https://feedback.hopoduck.com/v1/feedback";

export const FEEDBACK_MAX_CONTENT = 3000;
export const FEEDBACK_MAX_EMAIL = 254;
// Worker 한도(45MB)와 같게 맞춘다. 텔레그램 봇 파일 한도는 50MB
export const FEEDBACK_MAX_FILE_BYTES = 45 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appVersion(): string {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR ? " portable" : "";
  return `${app.getVersion()}${portable}`;
}

export async function submitFeedback(
  payload: FeedbackPayload,
): Promise<FeedbackResult> {
  const content = payload.content.trim();
  const email = payload.email.trim();
  if (content.length === 0 || content.length > FEEDBACK_MAX_CONTENT) {
    throw new Error("본문 길이가 올바르지 않습니다");
  }
  if (
    email !== "" &&
    (email.length > FEEDBACK_MAX_EMAIL || !EMAIL.test(email))
  ) {
    throw new Error("이메일 형식이 올바르지 않습니다");
  }

  const form = new FormData();
  form.set("app", "doujin-menu");
  form.set("kind", payload.kind);
  form.set("content", content);
  form.set("email", email);
  form.set("version", appVersion());

  const archivePath = path.join(
    app.getPath("temp"),
    `doujin-menu-feedback-${Date.now()}.dmd`,
  );
  try {
    if (payload.attachDebug) {
      await writeDebugArchive(archivePath, payload.includeDb);
      const { size } = await stat(archivePath);
      if (size > FEEDBACK_MAX_FILE_BYTES) {
        return { ok: false, reason: "too-large", size };
      }
      const bytes = await readFile(archivePath);
      form.set("file", new Blob([bytes]), buildDebugFilename());
    }

    let res: Response;
    try {
      res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      log.warn("[Feedback] 전송 실패 (네트워크):", error);
      return { ok: false, reason: "failed" };
    }

    if (res.ok) {
      const data = (await res.json()) as { id: number };
      log.info(`[Feedback] 전송 완료 #${data.id}`);
      return { ok: true, id: data.id };
    }
    log.warn(`[Feedback] 전송 실패: HTTP ${res.status} ${await res.text()}`);
    if (res.status === 429) return { ok: false, reason: "rate-limited" };
    if (res.status === 413) return { ok: false, reason: "too-large" };
    return { ok: false, reason: "failed" };
  } finally {
    await unlink(archivePath).catch(() => {});
  }
}

export function registerFeedbackHandlers() {
  ipcMain.handle("submit-feedback", (_event, payload: FeedbackPayload) =>
    submitFeedback(payload),
  );
}
