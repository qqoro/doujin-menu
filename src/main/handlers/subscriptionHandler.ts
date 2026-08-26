/**
 * 구독 IPC 핸들러.
 *
 * 기준선(last_seen_id) 계산을 따로 구현하지 않는다. 새 구독은 last_seen_id를
 * 비운 채 넣고 조용한 사이클을 한 번 돌리면, 폴러의 "기준선 미설정" 경로가
 * 알아서 현재 최대 ID를 채우고 그 회차를 신작 0건으로 처리한다.
 * 조회가 실패하면 비어 있는 채로 남고 다음 성공 사이클에서 채워진다.
 */
import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { console } from "../main.js";
import db from "../db/index.js";
import type { Subscription } from "../../types/ipc.js";
import {
  getFeedSlice,
  getStatus,
  getSubscriptionErrors,
  isFeedReady,
  markAllSeen,
  runCycle,
  setToastTarget,
  startPolling,
  stopPolling,
} from "../services/subscription/subscriptionPoller.js";
import {
  normalizeQuery,
  validateSubscriptionQuery,
} from "../services/subscription/query.js";
import { store as configStore } from "./configHandler.js";

/** DB 행을 렌더러용 모양으로 바꾼다 (SQLite는 boolean을 0/1로 준다) */
const toSubscription = (row: Record<string, unknown>): Subscription => ({
  id: row.id as number,
  query: row.query as string,
  normalized_query: row.normalized_query as string,
  label: (row.label as string | null) ?? null,
  enabled: Boolean(row.enabled),
  last_seen_id: (row.last_seen_id as number | null) ?? null,
  created_at: String(row.created_at),
  last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
});

export const handleGetSubscriptions = async () => {
  try {
    const rows = await db("Subscription").orderBy("id");
    return {
      success: true,
      data: rows.map(toSubscription),
      errors: getSubscriptionErrors(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error getting subscriptions:", error);
    return { success: false, error: message };
  }
};

export const handleAddSubscription = async (params: {
  query: string;
  label?: string;
}) => {
  try {
    const validation = validateSubscriptionQuery(params.query);
    if (!validation.ok) {
      return { success: false, error: validation.reason };
    }

    const normalized = normalizeQuery(params.query);

    // unique 제약에 맡기면 SQLite 원문 에러가 그대로 토스트에 뜬다
    const existing = await db("Subscription")
      .where("normalized_query", normalized)
      .first();
    if (existing) {
      return { success: false, error: "이미 같은 검색어를 구독하고 있습니다." };
    }

    const [id] = await db("Subscription").insert({
      query: params.query.trim(),
      normalized_query: normalized,
      label: params.label?.trim() || null,
      enabled: true,
      last_seen_id: null,
    });

    // 기준선을 채우고 피드를 다시 만든다. 유저가 방금 한 행동이라 알리지 않는다
    await runCycle({ silent: true });

    const row = await db("Subscription").where("id", id).first();
    return { success: true, data: toSubscription(row) };
  } catch (error) {
    // 원문 대신 한국어 문장을 돌려준다. SQLite 제약 위반 메시지가 그대로
    // 토스트에 뜨면 안 된다
    console.error("Error adding subscription:", error);
    return { success: false, error: "구독을 추가하지 못했습니다." };
  }
};

export const handleUpdateSubscription = async (params: {
  id: number;
  query?: string;
  label?: string;
  enabled?: boolean;
}) => {
  try {
    const patch: Record<string, unknown> = {};

    if (params.query !== undefined) {
      const validation = validateSubscriptionQuery(params.query);
      if (!validation.ok) {
        return { success: false, error: validation.reason };
      }

      const normalized = normalizeQuery(params.query);

      // unique 제약에 맡기면 SQLite 원문 에러가 그대로 토스트에 뜬다.
      // 자기 자신은 빼야 검색어를 그대로 둔 저장이 중복으로 걸리지 않는다
      const duplicate = await db("Subscription")
        .where("normalized_query", normalized)
        .whereNot("id", params.id)
        .first();
      if (duplicate) {
        return {
          success: false,
          error: "이미 같은 검색어를 구독하고 있습니다.",
        };
      }

      patch.query = params.query.trim();
      patch.normalized_query = normalized;

      // last_seen_id는 일부러 건드리지 않는다. 이 값은 검색어에 매인 게 아니라
      // "이 갤러리 ID까지는 정산했다"는 워터마크라, 검색어가 바뀌어도 그대로
      // 유효하다. 비우면 폴러가 기준선 미설정 경로로 현재 최대값을 채우면서
      // 그 사이에 올라온 신작을 조용히 삼킨다
    }

    if (params.label !== undefined) patch.label = params.label.trim() || null;
    if (params.enabled !== undefined) patch.enabled = params.enabled;

    if (Object.keys(patch).length === 0) return { success: true };

    await db("Subscription").where("id", params.id).update(patch);

    // 검색어를 바꾸거나 켜고 끄면 피드 구성이 달라진다. 다음 폴링까지 기다리면
    // 목록이 안 맞는다.
    // 재활성화로 한꺼번에 잡히는 신작은 유저가 방금 켠 결과라 알리지 않는다
    if (params.enabled !== undefined || params.query !== undefined) {
      await runCycle({ silent: true });
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error updating subscription:", error);
    return { success: false, error: message };
  }
};

export const handleRemoveSubscription = async (id: number) => {
  try {
    await db("Subscription").where("id", id).delete();
    await runCycle({ silent: true });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error removing subscription:", error);
    return { success: false, error: message };
  }
};

export const handleGetSubscriptionFeed = async (params: {
  start: number;
  count: number;
}) => {
  try {
    // 앱 시작 직후 첫 폴링 전에 구독 탭을 열면 피드가 비어 있다.
    // 재진입 가드가 있으므로 자동 폴링과 겹쳐도 사이클이 겹쳐 돌지 않는다
    if (!isFeedReady()) await runCycle({ silent: true });

    const slice = getFeedSlice(params.start, params.count);
    return {
      success: true,
      data: slice.ids,
      total: slice.total,
      generation: slice.generation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error getting subscription feed:", error);
    return { success: false, error: message };
  }
};

export const handleGetSubscriptionStatus = async () => {
  try {
    return { success: true, data: getStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error getting subscription status:", error);
    return { success: false, error: message };
  }
};

export const handleEnterSubscriptionTab = async () => {
  try {
    if (!isFeedReady()) await runCycle({ silent: true });
    await markAllSeen();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error entering subscription tab:", error);
    return { success: false, error: message };
  }
};

export const handleRefreshSubscriptions = async () => {
  try {
    await runCycle();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error refreshing subscriptions:", error);
    return { success: false, error: message };
  }
};

/**
 * 폴링을 시작한다. main.ts가 renderer-ready 이후에 부른다.
 *
 * 렌더러가 리스너 등록을 마친 뒤여야 첫 토스트를 잃지 않는다.
 */
export const startSubscriptionPollingIfEnabled = (): void => {
  if (configStore.get("subscriptionEnabled", true) === false) return;

  void runCycle();
  startPolling();
};

/** 설정 스위치가 바뀔 때 폴링을 걸거나 푼다 */
export const applySubscriptionEnabled = (enabled: boolean): void => {
  if (enabled) {
    void runCycle();
    startPolling();
  } else {
    stopPolling();
  }
};

export function registerSubscriptionHandlers(mainWindow: BrowserWindow) {
  // 토스트는 메인 창에만 보낸다. broadcast로 보내면 뷰어 창에도 뜬다
  setToastTarget(mainWindow.webContents);

  // 설정 스위치를 감시한다. configHandler가 이쪽을 부르게 하면 순환 참조가 된다
  // (subscriptionHandler → configHandler)
  configStore.onDidChange("subscriptionEnabled", (value) => {
    applySubscriptionEnabled(value !== false);
  });

  ipcMain.handle("get-subscriptions", handleGetSubscriptions);
  ipcMain.handle("add-subscription", (_event, params) =>
    handleAddSubscription(params),
  );
  ipcMain.handle("update-subscription", (_event, params) =>
    handleUpdateSubscription(params),
  );
  ipcMain.handle("remove-subscription", (_event, id) =>
    handleRemoveSubscription(id),
  );
  ipcMain.handle("get-subscription-feed", (_event, params) =>
    handleGetSubscriptionFeed(params),
  );
  ipcMain.handle("get-subscription-status", handleGetSubscriptionStatus);
  ipcMain.handle("enter-subscription-tab", handleEnterSubscriptionTab);
  ipcMain.handle("refresh-subscriptions", handleRefreshSubscriptions);
}
