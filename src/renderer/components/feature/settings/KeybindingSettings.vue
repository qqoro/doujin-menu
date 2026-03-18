<script setup lang="ts">
import { useKeybindingStore } from "@/store/keybindingStore";
import {
  getKeyLabel,
  normalizeKey,
  isModifierOnly,
} from "@/lib/keybindings/utils";
import type { KeybindingContext } from "@/lib/keybindings/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@iconify/vue";
import { ref, computed } from "vue";
import { toast } from "vue-sonner";

const ipcRenderer = window.require("electron").ipcRenderer;

const store = useKeybindingStore();

// 검색어 상태
const searchQuery = ref("");

// 녹음 상태 (어떤 액션의 몇 번째 키를 녹음 중인지)
const recordingActionId = ref<string | null>(null);
const recordingKeyIndex = ref<number>(-1);

// 컨텍스트별 한국어 이름 및 아이콘
const contextMeta: Record<KeybindingContext, { label: string; icon: string }> =
  {
    viewer: { label: "뷰어", icon: "solar:display-bold-duotone" },
    library: { label: "라이브러리", icon: "solar:library-bold-duotone" },
    layout: { label: "레이아웃", icon: "solar:widget-bold-duotone" },
    downloader: {
      label: "다운로더",
      icon: "solar:download-square-bold-duotone",
    },
    global: { label: "전역", icon: "solar:global-bold-duotone" },
  };

// 컨텍스트 표시 순서
const contextOrder: KeybindingContext[] = [
  "viewer",
  "library",
  "layout",
  "downloader",
  "global",
];

// 검색 필터링된 바인딩 (컨텍스트별 그룹)
const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return contextOrder
    .map((context) => {
      const bindings = store.resolvedBindings.filter((b) => {
        if (b.context !== context) return false;
        if (!query) return true;
        return b.description.toLowerCase().includes(query);
      });
      return { context, bindings };
    })
    .filter((g) => g.bindings.length > 0);
});

// 변경된 항목 수 계산 (헤더 배지용)
const modifiedCount = computed(
  () => store.resolvedBindings.filter((b) => b.isModified).length,
);

// electron-store에 오버라이드 저장
async function saveToConfig() {
  await ipcRenderer.invoke("set-config", {
    key: "keybindingOverrides",
    value: store.getOverrides(),
  });
}

// 전체 초기화
async function resetAll() {
  store.resetAll();
  await saveToConfig();
  toast.success("모든 단축키가 기본값으로 초기화되었습니다.");
}

// 개별 액션 초기화
async function resetAction(actionId: string) {
  store.resetAction(actionId);
  await saveToConfig();
}

// 키 제거
async function removeKey(actionId: string, keyIndex: number) {
  const binding = store.resolvedBindings.find((b) => b.id === actionId);
  if (!binding) return;
  const newKeys = binding.keys.filter((_, i) => i !== keyIndex);
  store.setKeys(actionId, newKeys);
  await saveToConfig();
}

// 녹음 시작 (keyIndex = -1 이면 새 키 추가, 0 이상이면 해당 키 교체)
function startRecording(actionId: string, keyIndex: number) {
  recordingActionId.value = actionId;
  recordingKeyIndex.value = keyIndex;
  window.addEventListener("keydown", handleRecordKey, { capture: true });
}

// 녹음 중 키 입력 처리
function handleRecordKey(e: KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();

  // 수식키만 단독으로 누른 경우 무시
  if (isModifierOnly(e)) return;

  const normalized = normalizeKey(e);
  const actionId = recordingActionId.value!;
  const binding = store.resolvedBindings.find((b) => b.id === actionId);
  if (!binding) return;

  const newKeys = [...binding.keys];
  if (recordingKeyIndex.value === -1) {
    // 새 키 추가
    newKeys.push(normalized);
  } else {
    // 기존 키 교체
    newKeys[recordingKeyIndex.value] = normalized;
  }

  const result = store.setKeys(actionId, newKeys);

  // 충돌로 인해 다른 액션에서 키가 해제된 경우 알림
  if (result.removedFrom?.length) {
    for (const removed of result.removedFrom) {
      const removedAction = store.resolvedBindings.find(
        (b) => b.id === removed.actionId,
      );
      if (removedAction) {
        toast.info(
          `'${removedAction.description}'에서 [${getKeyLabel(removed.key)}] 키가 해제되었습니다`,
        );
      }
    }
  }

  saveToConfig();
  cancelRecording();
}

// 녹음 취소
function cancelRecording() {
  recordingActionId.value = null;
  recordingKeyIndex.value = -1;
  window.removeEventListener("keydown", handleRecordKey, { capture: true });
}

// 녹음 중인지 확인 (특정 액션 + 특정 키 인덱스)
function isRecording(actionId: string, keyIndex: number) {
  return (
    recordingActionId.value === actionId && recordingKeyIndex.value === keyIndex
  );
}
</script>

<template>
  <!-- 녹음 중 오버레이 -->
  <Teleport to="body">
    <div
      v-if="recordingActionId !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click="cancelRecording"
    >
      <div
        class="bg-background rounded-xl border p-8 text-center shadow-2xl"
        @click.stop
      >
        <Icon
          icon="solar:keyboard-bold-duotone"
          class="text-primary mx-auto mb-4 h-12 w-12"
        />
        <p class="text-foreground mb-2 text-lg font-semibold">
          키를 입력하세요
        </p>
        <p class="text-muted-foreground text-sm">
          원하는 단축키를 누르세요. 바깥을 클릭하면 취소됩니다.
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-4"
          @click="cancelRecording"
        >
          취소
        </Button>
      </div>
    </div>
  </Teleport>

  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle>단축키 설정</CardTitle>
          <CardDescription
            >각 기능에 할당된 단축키를 확인하고 변경합니다.</CardDescription
          >
        </div>
        <!-- 전체 초기화 버튼 (변경 항목이 있을 때만 표시) -->
        <Button
          v-if="modifiedCount > 0"
          variant="outline"
          size="sm"
          class="shrink-0"
          @click="resetAll"
        >
          <Icon icon="solar:refresh-bold-duotone" class="mr-1.5 h-4 w-4" />
          전체 초기화
          <span
            class="bg-muted ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-xs"
            >{{ modifiedCount }}</span
          >
        </Button>
      </div>
      <!-- 검색 필터 -->
      <div class="relative mt-2">
        <Icon
          icon="solar:minimalistic-magnifer-linear"
          class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        />
        <Input v-model="searchQuery" placeholder="액션 검색..." class="pl-9" />
      </div>
    </CardHeader>
    <CardContent>
      <!-- 검색 결과 없음 -->
      <div
        v-if="filteredGroups.length === 0"
        class="text-muted-foreground py-8 text-center text-sm"
      >
        <Icon
          icon="solar:minimalistic-magnifer-bold-duotone"
          class="mx-auto mb-2 h-8 w-8 opacity-50"
        />
        <p>검색 결과가 없습니다.</p>
      </div>

      <!-- 컨텍스트별 Accordion -->
      <Accordion
        v-else
        type="multiple"
        :default-value="contextOrder"
        class="space-y-1"
      >
        <AccordionItem
          v-for="group in filteredGroups"
          :key="group.context"
          :value="group.context"
          class="overflow-hidden rounded-lg border last:border-b"
        >
          <AccordionTrigger
            class="hover:bg-muted/50 px-4 py-3 hover:no-underline"
          >
            <div class="flex items-center gap-2">
              <Icon
                :icon="contextMeta[group.context].icon"
                class="text-primary h-5 w-5"
              />
              <span class="font-medium">{{
                contextMeta[group.context].label
              }}</span>
              <span class="text-muted-foreground text-xs"
                >({{ group.bindings.length }}개)</span
              >
            </div>
          </AccordionTrigger>
          <AccordionContent class="px-0">
            <div class="divide-y">
              <div
                v-for="binding in group.bindings"
                :key="binding.id"
                :class="[
                  'flex items-center justify-between gap-4 px-4 py-3 transition-colors',
                  binding.isModified ? 'bg-primary/5' : '',
                ]"
              >
                <!-- 액션 설명 -->
                <div class="flex min-w-0 flex-col">
                  <span class="text-sm font-medium">{{
                    binding.description
                  }}</span>
                  <!-- 변경됨 표시 -->
                  <div
                    v-if="binding.isModified"
                    class="mt-0.5 flex items-center gap-1"
                  >
                    <span class="text-muted-foreground text-xs">기본값:</span>
                    <div class="flex flex-wrap gap-1">
                      <kbd
                        v-for="key in binding.defaultKeys"
                        :key="key"
                        class="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs opacity-60"
                      >
                        {{ getKeyLabel(key) }}
                      </kbd>
                    </div>
                  </div>
                </div>

                <!-- 키 목록 + 개별 초기화 -->
                <div
                  class="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
                >
                  <!-- 등록된 키 뱃지 -->
                  <button
                    v-for="(key, idx) in binding.keys"
                    :key="`${binding.id}-${idx}`"
                    :class="[
                      'group relative flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs transition-colors',
                      isRecording(binding.id, idx)
                        ? 'border-primary bg-primary/10 text-primary animate-pulse'
                        : 'bg-muted text-foreground hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
                    ]"
                    @click="startRecording(binding.id, idx)"
                  >
                    {{ getKeyLabel(key) }}
                    <!-- × 버튼 (키 제거) -->
                    <span
                      class="text-muted-foreground hover:text-destructive ml-0.5 rounded-sm leading-none transition-colors"
                      title="키 제거"
                      @click.stop="removeKey(binding.id, idx)"
                    >
                      <Icon
                        icon="solar:close-circle-bold"
                        class="h-3.5 w-3.5"
                      />
                    </span>
                  </button>

                  <!-- + 버튼 (키 추가) -->
                  <button
                    :class="[
                      'flex items-center gap-0.5 rounded border border-dashed px-2 py-0.5 text-xs transition-colors',
                      isRecording(binding.id, -1)
                        ? 'border-primary bg-primary/10 text-primary animate-pulse'
                        : 'text-muted-foreground border-muted-foreground/30 hover:border-primary/50 hover:text-primary cursor-pointer',
                    ]"
                    title="단축키 추가"
                    @click="startRecording(binding.id, -1)"
                  >
                    <Icon icon="solar:add-circle-bold" class="h-3.5 w-3.5" />
                    <span>추가</span>
                  </button>

                  <!-- 개별 초기화 버튼 (변경된 항목만) -->
                  <Button
                    v-if="binding.isModified"
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0"
                    title="이 항목 초기화"
                    @click="resetAction(binding.id)"
                  >
                    <Icon icon="solar:restart-bold" class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent>
  </Card>
</template>
