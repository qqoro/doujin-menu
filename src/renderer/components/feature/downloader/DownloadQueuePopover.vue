<script setup lang="ts">
import ProxiedImage from "@/components/common/ProxiedImage.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import { Icon } from "@iconify/vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import type { DownloadQueueItem } from "../../../../types/ipc";

const downloadQueueStore = useDownloadQueueStore();
const { queue, activeQueueCount, isLoading } = storeToRefs(downloadQueueStore);

onMounted(() => {
  downloadQueueStore.initialize();
});

onUnmounted(() => {
  downloadQueueStore.cleanup();
});

// 상태별 색상 및 아이콘
const getStatusInfo = (status: DownloadQueueItem["status"]) => {
  switch (status) {
    case "pending":
      return {
        label: "대기 중",
        color: "text-blue-500",
        icon: "solar:clock-circle-bold-duotone",
      };
    case "downloading":
      return {
        label: "다운로드 중",
        color: "text-green-500",
        icon: "solar:download-minimalistic-bold-duotone",
      };
    case "completed":
      return {
        label: "완료",
        color: "text-green-600",
        icon: "solar:check-circle-bold-duotone",
      };
    case "failed":
      return {
        label: "실패",
        color: "text-red-500",
        icon: "solar:close-circle-bold-duotone",
      };
    case "paused":
      return {
        label: "일시정지",
        color: "text-yellow-500",
        icon: "solar:pause-circle-bold-duotone",
      };
    default:
      return {
        label: "알 수 없음",
        color: "text-gray-500",
        icon: "solar:question-circle-bold-duotone",
      };
  }
};

// 다운로드 일시정지
const handlePause = async (queueId: number) => {
  try {
    await downloadQueueStore.pauseDownload(queueId);
    toast.success("다운로드가 일시정지되었습니다.");
  } catch (error) {
    toast.error("일시정지 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

// 다운로드 재개
const handleResume = async (queueId: number) => {
  try {
    await downloadQueueStore.resumeDownload(queueId);
    toast.success("다운로드가 재개되었습니다.");
  } catch (error) {
    toast.error("재개 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

// 다운로드 재시도
const handleRetry = async (queueId: number) => {
  try {
    await downloadQueueStore.retryDownload(queueId);
    toast.success("다운로드를 재시도합니다.");
  } catch (error) {
    toast.error("재시도 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

// 큐에서 제거
const handleRemove = async (queueId: number) => {
  try {
    await downloadQueueStore.removeFromQueue(queueId);
    toast.success("큐에서 제거되었습니다.");
  } catch (error) {
    toast.error("제거 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

// 완료된 항목 모두 제거
const handleClearCompleted = async () => {
  try {
    await downloadQueueStore.clearCompleted();
    toast.success("완료된 항목이 모두 제거되었습니다.");
  } catch (error) {
    toast.error("제거 실패", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};

// 큐가 비어있는지
const isEmpty = computed(() => queue.value.length === 0);

// 최신 항목이 위에 오도록 역순으로 정렬
const sortedQueue = computed(() => {
  return [...queue.value].reverse();
});
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" class="relative">
        <Icon icon="solar:download-square-bold-duotone" class="w-5 h-5" />
        <span>다운로드 큐</span>
        <Badge
          v-if="activeQueueCount > 0"
          class="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs px-1.5"
          >{{ activeQueueCount }}</Badge
        >
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="w-[600px] max-h-[600px] overflow-y-auto p-0"
      align="end"
    >
      <div class="sticky top-0 bg-background border-b p-4 z-10">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-lg flex items-center gap-2">
            <Icon icon="solar:download-square-bold-duotone" class="w-5 h-5" />
            다운로드 큐
            <Badge variant="secondary">{{ queue.length }}개</Badge>
          </h3>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="isLoading"
              @click="downloadQueueStore.fetchQueue"
            >
              <Icon icon="solar:refresh-bold-duotone" class="w-4 h-4" />
              새로고침
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="downloadQueueStore.completedDownloads.length === 0"
              @click="handleClearCompleted"
            >
              <Icon
                icon="solar:trash-bin-minimalistic-bold-duotone"
                class="w-4 h-4"
              />
              완료 항목 제거
            </Button>
          </div>
        </div>
      </div>

      <div v-if="isEmpty" class="p-8 text-center text-muted-foreground">
        <Icon
          icon="solar:folder-with-files-bold-duotone"
          class="w-16 h-16 mx-auto mb-4 opacity-50"
        />
        <p>다운로드 큐가 비어있습니다.</p>
        <p class="text-sm mt-2">다운로더에서 작품을 다운로드하세요.</p>
      </div>

      <div v-else class="divide-y">
        <div
          v-for="item in sortedQueue"
          :key="item.id"
          class="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
        >
          <!-- 썸네일 -->
          <div
            class="w-20 h-28 flex-shrink-0 overflow-hidden rounded-md bg-muted relative"
          >
            <ProxiedImage
              v-if="item.thumbnail_url"
              :id="item.gallery_id"
              :url="item.thumbnail_url"
              :referer="`https://hitomi.la/reader/${item.gallery_id}.html`"
              alt="Thumbnail"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-muted-foreground"
            >
              <Icon icon="solar:gallery-bold-duotone" class="w-8 h-8" />
            </div>
          </div>

          <!-- 정보 -->
          <div class="flex-1 min-w-0">
            <h4
              class="font-medium text-sm truncate"
              :title="item.gallery_title"
            >
              {{ item.gallery_title }}
            </h4>
            <p
              v-if="item.gallery_artist"
              class="text-xs text-muted-foreground truncate"
            >
              <Icon
                icon="solar:pen-new-round-linear"
                class="w-3 h-3 inline-block align-text-bottom"
              />
              {{ item.gallery_artist }}
            </p>

            <!-- 상태 -->
            <div class="flex items-center gap-2 mt-1">
              <Badge
                :class="getStatusInfo(item.status).color"
                variant="outline"
                class="text-xs"
              >
                <Icon
                  :icon="getStatusInfo(item.status).icon"
                  class="w-3 h-3 mr-1"
                />
                {{ getStatusInfo(item.status).label }}
              </Badge>

              <!-- 진행률 -->
              <span
                v-if="
                  item.status === 'downloading' || item.status === 'completed'
                "
                class="text-xs text-muted-foreground"
              >
                {{ item.progress }}%
              </span>
            </div>

            <!-- 진행 바 -->
            <div
              v-if="
                item.status === 'downloading' || item.status === 'completed'
              "
              class="w-full bg-muted rounded-full h-1.5 mt-2"
            >
              <div
                class="bg-blue-500 h-1.5 rounded-full transition-all"
                :style="{ width: `${item.progress}%` }"
              ></div>
            </div>

            <!-- 에러 메시지 -->
            <p
              v-if="item.error_message"
              class="text-xs text-red-500 mt-1 truncate"
              :title="item.error_message"
            >
              {{ item.error_message }}
            </p>
          </div>

          <!-- 액션 버튼 -->
          <div class="flex flex-col gap-1">
            <!-- 일시정지 -->
            <Button
              v-if="item.status === 'downloading'"
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              @click="handlePause(item.id)"
            >
              <Icon icon="solar:pause-bold-duotone" class="w-4 h-4" />
            </Button>

            <!-- 재개 -->
            <Button
              v-if="item.status === 'paused'"
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              @click="handleResume(item.id)"
            >
              <Icon icon="solar:play-bold-duotone" class="w-4 h-4" />
            </Button>

            <!-- 재시도 -->
            <Button
              v-if="item.status === 'failed'"
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              @click="handleRetry(item.id)"
            >
              <Icon icon="solar:restart-bold-duotone" class="w-4 h-4" />
            </Button>

            <!-- 제거 -->
            <Button
              v-if="item.status !== 'downloading'"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-destructive"
              @click="handleRemove(item.id)"
            >
              <Icon
                icon="solar:trash-bin-minimalistic-bold-duotone"
                class="w-4 h-4"
              />
            </Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
