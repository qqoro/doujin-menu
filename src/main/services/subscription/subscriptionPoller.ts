/**
 * 구독 폴링. 앱이 켜져 있는 동안 주기적으로 신작을 확인한다.
 *
 * 상태는 전부 프로세스 메모리다 — 신작도 피드도 DB에 쌓지 않는다.
 * 구독 검색을 다시 돌리면 나오는 정보라 저장할 이유가 없다.
 */
import type { WebContents } from "electron";
import type { Tag } from "node-hitomi";
import db from "../../db/index.js";
import { store as configStore } from "../../handlers/configHandler.js";
import { fetchTagIds } from "../hitomi/tags.js";
import { broadcast, sendTo } from "../../utils/broadcast.js";
import { buildFeed, countNew, intersect, maxId } from "./feed.js";
import { parseSubscriptionQuery } from "./query.js";

/** 확인 주기. 고정값이다 (설정에서는 켜고 끄기만 한다) */
const POLL_INTERVAL = 60 * 60 * 1000;

export interface SubscriptionStatus {
  newCount: number;
  subscriptionCount: number;
  feedTotal: number;
  lastCheckedAt: string | null;
}

interface SubscriptionRow {
  id: number;
  query: string;
  enabled: number | boolean;
  last_seen_id: number | null;
}

interface SubscriptionState {
  ids: number[];
  maxId: number | null;
  newCount: number;
  error?: string;
}

let states = new Map<number, SubscriptionState>();
let feed: Int32Array = new Int32Array(0);
let feedGeneration = 0;
let feedReady = false;
let lastCheckedAt: string | null = null;

/** 이번 세션에 이미 알린 신작 총 건수. 같은 신작으로 매시간 다시 알리지 않기 위해 쓴다 */
let notifiedCount = 0;

/** 진행 중인 사이클. 재진입 가드 겸 대기 지점이다 */
let cycleInFlight: Promise<void> | null = null;

let timer: NodeJS.Timeout | null = null;
let toastTarget: WebContents | null = null;

/** 토스트를 받을 창. 뷰어 창에 알림이 겹치지 않도록 메인 창만 지정한다 */
export const setToastTarget = (webContents: WebContents | null): void => {
  toastTarget = webContents;
};

/** 테스트 전용: 모듈 수준 상태를 초기화한다 */
export const __resetSubscriptionState = (): void => {
  states = new Map();
  feed = new Int32Array(0);
  feedGeneration = 0;
  feedReady = false;
  lastCheckedAt = null;
  notifiedCount = 0;
  cycleInFlight = null;
  if (timer) clearInterval(timer);
  timer = null;
  toastTarget = null;
};

const tagKey = (tag: Tag): string => `${tag.type}:${tag.name}`;

/**
 * 태그 하나의 ID 배열을 사이클 캐시에서 가져온다.
 *
 * 여러 구독이 language:korean 같은 태그를 공유하므로, 사이클 안에서는 한 번만 받는다.
 */
const resolveTag = async (
  tag: Tag,
  cache: Map<string, number[]>,
): Promise<number[]> => {
  const key = tagKey(tag);
  const cached = cache.get(key);
  if (cached) return cached;

  const ids = await fetchTagIds(tag);
  cache.set(key, ids);
  return ids;
};

/** 구독 하나를 확인한다. 실패하면 던진다 */
const checkSubscription = async (
  row: SubscriptionRow,
  blacklist: string[],
  cache: Map<string, number[]>,
): Promise<SubscriptionState> => {
  const { positive, negative } = parseSubscriptionQuery(row.query, blacklist);

  if (positive.length === 0) {
    throw new Error(`양성 태그가 없는 구독입니다: ${row.query}`);
  }

  const positiveSets: number[][] = [];
  for (const tag of positive) {
    positiveSets.push(await resolveTag(tag, cache));
  }

  const negativeSets: number[][] = [];
  for (const tag of negative) {
    negativeSets.push(await resolveTag(tag, cache));
  }

  const ids = intersect(positiveSets, negativeSets);
  const max = maxId(ids);

  // 기준선이 없으면 지금 값으로 잡고 이번 회차는 신작으로 치지 않는다.
  // 0으로 두면 그 작가의 전작이 전부 신작이 되어 빨간 점이 켜진다
  if (row.last_seen_id === null) {
    await db("Subscription")
      .where("id", row.id)
      .update({ last_seen_id: max ?? 0 });
    return { ids, maxId: max, newCount: 0 };
  }

  return { ids, maxId: max, newCount: countNew(ids, row.last_seen_id) };
};

const doCycle = async (silent: boolean): Promise<void> => {
  const subscriptions: SubscriptionRow[] = await db("Subscription")
    .where("enabled", true)
    .orderBy("id");

  const blacklist = (configStore.get("downloaderBlacklistTags", []) ??
    []) as string[];
  const cache = new Map<string, number[]>();
  const nextStates = new Map<number, SubscriptionState>();
  let anySucceeded = false;

  // 순차로 돈다. 동시에 쏠 이유가 없고, 폴링은 급하지 않다
  for (const subscription of subscriptions) {
    // 워터마크는 처리 시점에 매번 다시 읽는다. 루프 시작 시 스냅샷을 잡으면
    // 사이클 도중 유저가 읽음 처리를 했을 때 읽은 항목이 신작으로 되살아난다
    const fresh: SubscriptionRow | undefined = await db("Subscription")
      .where("id", subscription.id)
      .first();
    if (!fresh || !fresh.enabled) continue;

    const previous = states.get(fresh.id);

    try {
      nextStates.set(
        fresh.id,
        await checkSubscription(fresh, blacklist, cache),
      );
      anySucceeded = true;
      await db("Subscription")
        .where("id", fresh.id)
        .update({ last_checked_at: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Subscription] 구독 확인 실패 (id=${fresh.id}):`, message);
      // 직전 결과를 남겨둔다. 일시적 실패로 목록이 통째로 비지 않게
      nextStates.set(fresh.id, {
        ids: previous?.ids ?? [],
        maxId: previous?.maxId ?? null,
        newCount: previous?.newCount ?? 0,
        error: message,
      });
      // last_checked_at은 갱신하지 않는다 — 다음 주기에 다시 시도한다
    }
  }

  states = nextStates;
  feed = buildFeed([...states.values()].map((state) => state.ids));
  feedGeneration++;
  feedReady = true;
  if (anySucceeded) lastCheckedAt = new Date().toISOString();

  const status = getStatus();
  broadcast("subscriptions-updated");

  // 신작이 지난번보다 늘었을 때만 알린다. silent면 알리지 않되 기준은 올려둔다
  // (구독 추가·재활성화는 유저가 방금 한 행동이라 알릴 이유가 없다)
  if (status.newCount > notifiedCount) {
    if (!silent && toastTarget) {
      sendTo(toastTarget, "subscription-new-found", {
        subscriptionCount: [...states.values()].filter(
          (state) => state.newCount > 0,
        ).length,
        newCount: status.newCount,
      });
    }
    notifiedCount = status.newCount;
  }
};

/**
 * 한 사이클을 돌린다. 이미 진행 중이면 그 사이클이 끝날 때까지 기다린다.
 *
 * 자동 폴링·수동 새로고침·구독 변경·탭 첫 진입이 겹칠 수 있어 가드가 필수다.
 * 가드가 없으면 새로고침 연타만으로 사이클이 여러 개 동시에 돈다.
 */
export const runCycle = (opts: { silent?: boolean } = {}): Promise<void> => {
  if (cycleInFlight) return cycleInFlight;

  cycleInFlight = doCycle(opts.silent ?? false).finally(() => {
    cycleInFlight = null;
  });
  return cycleInFlight;
};

export const getStatus = (): SubscriptionStatus => {
  let newCount = 0;
  for (const state of states.values()) newCount += state.newCount;

  return {
    newCount,
    subscriptionCount: states.size,
    feedTotal: feed.length,
    lastCheckedAt,
  };
};

/** 통합 피드에서 구간을 잘라 준다. 응답 모양은 search-galleries와 같다 */
export const getFeedSlice = (
  start: number,
  count: number,
): { ids: number[]; total: number; generation: number } => ({
  ids: Array.from(feed.slice(start, start + count)),
  total: feed.length,
  generation: feedGeneration,
});

/** 첫 사이클이 끝났는지. 구독 탭이 조회 전에 사이클을 돌려야 하는지 판단한다 */
export const isFeedReady = (): boolean => feedReady;

/** 구독별 마지막 오류. 관리 팝오버에서 실패 표시에 쓴다 */
export const getSubscriptionErrors = (): Record<number, string> => {
  const errors: Record<number, string> = {};
  for (const [id, state] of states) {
    if (state.error) errors[id] = state.error;
  }
  return errors;
};

/**
 * 모든 구독의 워터마크를 각자 최대 ID로 올린다. 구독 탭에 들어갔을 때 부른다.
 * 아직 폴링되지 않은 구독(maxId 없음)은 건드리지 않는다.
 */
export const markAllSeen = async (): Promise<void> => {
  for (const [id, state] of states) {
    if (state.maxId === null) continue;
    await db("Subscription")
      .where("id", id)
      .update({ last_seen_id: state.maxId });
    state.newCount = 0;
  }

  // 신작 건수가 0으로 내려갔으므로 알림 기준도 같이 내린다.
  // 안 내리면 다음 신작이 이전 건수보다 적을 때 영영 조용해진다
  notifiedCount = 0;
  broadcast("subscriptions-updated");
};

export const startPolling = (): void => {
  if (timer) return;
  timer = setInterval(() => {
    void runCycle();
  }, POLL_INTERVAL);
};

export const stopPolling = (): void => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
