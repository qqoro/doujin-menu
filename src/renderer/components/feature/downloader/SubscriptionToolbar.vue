<script setup lang="ts">
import * as api from "@/api";
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  languageLabel,
  splitLanguage,
  withLanguage,
} from "@/lib/subscriptionQuery";
import { Icon } from "@iconify/vue";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import type { Subscription } from "../../../../types/ipc";

const props = defineProps<{
  newCount: number;
  lastCheckedAt: string | null;
  /** 추가할 검색어 앞에 붙일 언어. 툴바 필터에서 고른 값 */
  language: string;
  /** 차단 태그 개수. 구독 폴링에도 걸리므로 팝오버에서 알려준다 */
  blacklistCount: number;
}>();

const emit = defineEmits<{
  /** 구독 목록이 바뀌어 피드를 다시 조회해야 할 때 */
  (event: "changed"): void;
  /** 수동 새로고침 */
  (event: "refresh"): void;
}>();

const isOpen = ref(false);
const isLoading = ref(false);
const isAdding = ref(false);
const isRefreshing = ref(false);

/**
 * 켜고 끄기·삭제를 처리 중인 구독 id.
 *
 * 둘 다 메인에서 폴링 사이클을 돌고 오느라 몇 초 걸린다(실측 약 2초).
 * 그동안 다른 행까지 잠가 사이클이 겹쳐 쌓이는 것을 막는다.
 */
const pendingId = ref<number | null>(null);
const isBusy = computed(() => pendingId.value !== null);
const subscriptions = ref<Subscription[]>([]);
const errors = ref<Record<number, string>>({});
const newQuery = ref("");

/** 고치는 중인 구독 id */
const editingId = ref<number | null>(null);
const editingQuery = ref("");
const editingLabel = ref("");
const isSaving = ref(false);

const lastCheckedText = computed(() => {
  if (!props.lastCheckedAt) return "확인한 적 없음";
  return new Date(props.lastCheckedAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});

/** 지금 입력한 내용이 실제로 어떤 검색어로 등록되는지 */
const composedQuery = computed(() =>
  withLanguage(props.language, newQuery.value),
);

const languageHint = computed(() =>
  props.language === "all"
    ? "언어를 가리지 않고 구독됩니다."
    : `${languageLabel(props.language)}로 구독됩니다.`,
);

const canAdd = computed(
  () => newQuery.value.trim().length > 0 && !isAdding.value,
);

/** 모든 줄이 `language:korean`으로 시작하지 않도록 언어를 떼어 따로 보여준다 */
const rows = computed(() =>
  subscriptions.value.map((subscription) => {
    const { language, rest } = splitLanguage(subscription.query);
    return {
      subscription,
      language: language ? languageLabel(language) : null,
      // 언어만으로 이뤄진 구독이면 뗄 게 없어 원문을 그대로 쓴다
      queryText: rest || subscription.query,
      error: errors.value[subscription.id],
    };
  }),
);

const load = async () => {
  isLoading.value = true;
  try {
    const result = await api.getSubscriptions();
    subscriptions.value = result.items;
    errors.value = result.errors;
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독 목록을 불러오지 못했습니다.",
    );
  } finally {
    isLoading.value = false;
  }
};

// 자동완성이 Enter를 먼저 가로채 후보를 채운다. 타입만 채운 상태("artist:")면
// 아직 검색어가 아니라서 이름을 더 받는다
const handleEnter = () => {
  if (newQuery.value.trim().endsWith(":")) return;
  void handleAdd();
};

const handleAdd = async () => {
  if (!canAdd.value) return;

  // 메인이 구독 전체를 한 바퀴 돌며 기준선을 잡고 오기 때문에 몇 초 걸린다
  isAdding.value = true;
  try {
    await api.addSubscription({ query: composedQuery.value });
    newQuery.value = "";
    toast.success("구독에 추가했습니다.");
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 추가하지 못했습니다.",
    );
  } finally {
    isAdding.value = false;
  }
};

const handleRemove = async (subscription: Subscription) => {
  pendingId.value = subscription.id;
  try {
    await api.removeSubscription(subscription.id);
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 삭제하지 못했습니다.",
    );
  } finally {
    pendingId.value = null;
  }
};

const handleToggle = async (subscription: Subscription, enabled: boolean) => {
  pendingId.value = subscription.id;
  try {
    await api.updateSubscription({ id: subscription.id, enabled });
    await load();
    emit("changed");
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "구독을 수정하지 못했습니다.",
    );
  } finally {
    pendingId.value = null;
  }
};

// 언어 접두사도 고칠 수 있도록 queryText가 아닌 원문을 연다
const startEditing = (subscription: Subscription) => {
  editingId.value = subscription.id;
  editingQuery.value = subscription.query;
  editingLabel.value = subscription.label ?? "";
};

const cancelEditing = () => {
  editingId.value = null;
};

// 추가 칸과 같은 이유로 막는다
const handleEditEnter = () => {
  if (editingQuery.value.trim().endsWith(":")) return;
  void commitEditing();
};

const commitEditing = async () => {
  const id = editingId.value;
  if (id === null || isSaving.value) return;

  const target = subscriptions.value.find(
    (subscription) => subscription.id === id,
  );
  const query = editingQuery.value.trim();

  if (!query) {
    toast.error("검색어가 비어 있습니다.");
    return;
  }

  // 바뀐 것만 보낸다. 검색어를 그대로 둔 저장까지 폴링 사이클을 돌 이유는 없다
  const params: { id: number; query?: string; label?: string } = { id };
  if (query !== target?.query) params.query = query;
  if (editingLabel.value !== (target?.label ?? "")) {
    params.label = editingLabel.value;
  }

  if (params.query === undefined && params.label === undefined) {
    editingId.value = null;
    return;
  }

  isSaving.value = true;
  try {
    await api.updateSubscription(params);
    editingId.value = null;
    await load();
    // 검색어가 바뀌면 피드 구성이 달라진다
    if (params.query !== undefined) emit("changed");
  } catch (err) {
    // 검증 실패·중복이면 고칠 수 있게 편집 상태를 그대로 둔다
    toast.error(
      err instanceof Error ? err.message : "구독을 수정하지 못했습니다.",
    );
  } finally {
    isSaving.value = false;
  }
};

const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    emit("refresh");
    await load();
  } finally {
    isRefreshing.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <Button variant="outline" @click="load">
          <Icon icon="solar:feed-bold-duotone" class="h-4 w-4" />
          구독 관리
          <span class="text-muted-foreground ml-1 text-xs">
            {{ subscriptions.length }}
          </span>
        </Button>
      </PopoverTrigger>

      <!-- PopoverContent 자체가 flex-col + gap이라 여기서 간격을 또 주지 않습니다 -->
      <PopoverContent class="w-[26rem]" align="start">
        <div>
          <p class="text-sm font-semibold">구독 관리</p>
          <p class="text-muted-foreground text-xs">
            등록한 검색어의 신작을 앱이 켜져 있는 동안 1시간마다 확인합니다.
          </p>
        </div>

        <div class="flex gap-2">
          <SmartSearchInput
            v-model="newQuery"
            class="flex-1"
            placeholder="예: artist:작가명 female:sole_female"
            :show-actions="false"
            @keyup.enter="handleEnter"
          />
          <Button
            size="sm"
            variant="secondary"
            class="h-8 shrink-0"
            :disabled="!canAdd"
            @click="handleAdd"
          >
            <Icon
              v-if="isAdding"
              icon="svg-spinners:ring-resize"
              class="h-3.5 w-3.5"
            />
            {{ isAdding ? "확인 중" : "추가" }}
          </Button>
        </div>

        <!-- 툴바 필터는 팝오버에 가려 안 보이므로 무엇이 붙는지 알려줍니다 -->
        <p class="text-muted-foreground text-xs">
          {{ languageHint }} 툴바의 <em>필터 → 언어</em>에서 바꿀 수 있습니다.
          <template v-if="blacklistCount > 0">
            차단 태그 {{ blacklistCount }}개도 함께 빠집니다.
          </template>
        </p>

        <div
          v-if="rows.length === 0 && !isLoading"
          class="flex flex-col items-center gap-1.5 py-6"
        >
          <Icon
            icon="solar:feed-bold-duotone"
            class="text-muted-foreground h-8 w-8"
          />
          <p class="text-muted-foreground text-sm">구독한 검색어가 없습니다.</p>
        </div>

        <ul v-else class="-mx-1 max-h-80 space-y-1.5 overflow-y-auto px-1">
          <li
            v-for="row in rows"
            :key="row.subscription.id"
            class="bg-card hover:bg-accent/50 flex items-center gap-2.5 rounded-lg border px-2.5 py-2"
          >
            <!-- 입력칸이 둘이라 blur로 저장하면 칸만 옮겨도 저장됩니다 -->
            <template v-if="editingId === row.subscription.id">
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <SmartSearchInput
                  v-model="editingQuery"
                  placeholder="검색어 (예: artist:작가명)"
                  :show-actions="false"
                  @keyup.enter="handleEditEnter"
                  @keyup.esc="cancelEditing"
                />
                <Input
                  v-model="editingLabel"
                  placeholder="표시할 이름 (비우면 검색어)"
                  @keyup.enter="commitEditing"
                  @keyup.esc="cancelEditing"
                />
              </div>

              <div class="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="isSaving"
                  title="취소"
                  @click="cancelEditing"
                >
                  <Icon
                    icon="solar:close-circle-bold-duotone"
                    class="h-4 w-4"
                  />
                </Button>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  :disabled="isSaving"
                  title="저장"
                  @click="commitEditing"
                >
                  <Icon
                    :icon="
                      isSaving
                        ? 'svg-spinners:ring-resize'
                        : 'solar:check-circle-bold-duotone'
                    "
                    class="h-4 w-4"
                  />
                </Button>
              </div>
            </template>

            <template v-else>
              <Switch
                :model-value="row.subscription.enabled"
                :disabled="isBusy"
                :title="row.subscription.enabled ? '확인 중' : '멈춤'"
                @update:model-value="handleToggle(row.subscription, $event)"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <p
                    class="min-w-0 truncate text-sm"
                    :class="
                      row.subscription.enabled
                        ? ''
                        : 'text-muted-foreground line-through'
                    "
                    :title="row.subscription.query"
                  >
                    {{ row.subscription.label || row.queryText }}
                  </p>
                  <Badge v-if="row.language" variant="secondary">
                    {{ row.language }}
                  </Badge>
                </div>

                <p
                  v-if="row.error"
                  class="text-destructive mt-0.5 flex items-center gap-1 text-xs"
                  :title="row.error"
                >
                  <Icon
                    icon="solar:danger-triangle-bold-duotone"
                    class="h-3.5 w-3.5 shrink-0"
                  />
                  <span class="truncate"
                    >확인 실패 · 다음 확인에 다시 시도</span
                  >
                </p>
              </div>

              <!-- 켜고 끄기·삭제는 몇 초 걸리므로 그동안 버튼 자리를 스피너로 바꿉니다 -->
              <div
                v-if="pendingId === row.subscription.id"
                class="text-muted-foreground flex h-7 w-[3.625rem] shrink-0 items-center justify-center"
              >
                <Icon icon="svg-spinners:ring-resize" class="h-4 w-4" />
              </div>

              <div v-else class="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="isBusy"
                  title="검색어·이름 수정"
                  @click="startEditing(row.subscription)"
                >
                  <Icon icon="solar:pen-2-bold-duotone" class="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  :disabled="isBusy"
                  title="구독 삭제"
                  @click="handleRemove(row.subscription)"
                >
                  <Icon
                    icon="solar:trash-bin-trash-bold-duotone"
                    class="h-4 w-4"
                  />
                </Button>
              </div>
            </template>
          </li>
        </ul>

        <p class="text-muted-foreground border-t pt-2 text-xs">
          마지막 확인: {{ lastCheckedText }}
        </p>
      </PopoverContent>
    </Popover>

    <Button
      variant="secondary"
      size="icon"
      :disabled="isRefreshing"
      title="지금 확인"
      @click="handleRefresh"
    >
      <Icon
        icon="solar:refresh-bold-duotone"
        class="h-5 w-5"
        :class="isRefreshing ? 'animate-spin' : ''"
      />
    </Button>

    <span v-if="newCount > 0" class="text-sm font-medium">
      신작 {{ newCount }}건
    </span>
  </div>
</template>
