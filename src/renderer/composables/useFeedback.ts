import { ipcRenderer } from "@/api";
import { useMutation } from "@tanstack/vue-query";
import type { FeedbackPayload } from "../../types/ipc";

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (input: FeedbackPayload) =>
      ipcRenderer.invoke("submit-feedback", input),
  });
}

export function useExportDebugData() {
  return useMutation({
    mutationFn: (includeDb: boolean) =>
      ipcRenderer.invoke("export-debug-data", { includeDb }),
  });
}
