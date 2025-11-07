<script setup lang="ts">
import { ipcRenderer } from "@/api";
import { Button } from "@/components/ui/button";
import { onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  /**
   * 원본 이미지 URL
   */
  url: string;
  /**
   * 요청에 필요한 레퍼러
   */
  referer: string;
  /**
   * 캐시/파일 이름에 사용할 고유 ID (예: galleryId)
   */
  id: number | string;
  /**
   * 이미지 alt 속성
   */
  alt?: string;
  /**
   * 레이지 로딩 여부
   */
  lazy?: boolean;
}>();

const localSrc = ref<string>("");
const isLoading = ref(true);
const hasError = ref(false);
const retryCount = ref(0);
const retryTimeoutId = ref<NodeJS.Timeout | null>(null);
const isRetrying = ref(false); // 재시도 대기 중 상태

const RETRY_DELAYS = [3000, 5000]; // 3초, 5초

// 이 ref는 이미지가 로딩을 시작해야 할 때 true가 됩니다.
const activateLoad = ref(false);

// lazy prop이 false가 될 때 activateLoad를 true로 설정합니다.
watch(
  () => props.lazy,
  (newLazy) => {
    if (!newLazy) {
      activateLoad.value = true;
    }
  },
  { immediate: true }, // 컴포넌트 마운트 시 즉시 확인
);

const loadImage = async () => {
  if (!props.url || !props.id) {
    hasError.value = true;
    isLoading.value = false;
    return;
  }

  // 이미 로드된 이미지이고, 현재 로딩 중이 아니며, 에러가 없는 경우
  // 그리고 URL/ID가 변경되지 않았다면 다시 로드할 필요가 없습니다.
  // 이 부분은 필요에 따라 더 정교한 캐싱 로직으로 대체될 수 있습니다.
  if (
    localSrc.value &&
    !isLoading.value &&
    !hasError.value &&
    retryCount.value === 0 // 재시도 중이 아닐 때만 캐시 확인
  ) {
    return;
  }

  isLoading.value = true;
  hasError.value = false;
  isRetrying.value = false; // 로딩 시작 시 재시도 상태 초기화

  try {
    const result = await ipcRenderer.invoke("download-temp-thumbnail", {
      url: props.url,
      referer: props.referer,
      galleryId:
        typeof props.id === "number" ? props.id : parseInt(props.id, 10),
    });

    if (result.success && result.data) {
      localSrc.value = result.data;
      hasError.value = false;
      retryCount.value = 0; // 성공 시 재시도 카운트 초기화
    } else {
      console.error("프록시 이미지 로드 실패:", result.error);
      handleLoadError();
    }
  } catch (error) {
    console.error("download-temp-thumbnail 호출 오류:", error);
    handleLoadError();
  } finally {
    isLoading.value = false;
  }
};

const handleLoadError = () => {
  if (retryCount.value < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[retryCount.value];
    retryCount.value++;
    isRetrying.value = true; // 재시도 대기 상태로 변경
    console.log(
      `${delay / 1000}초 후 재시도 (${retryCount.value}/${RETRY_DELAYS.length})`,
    );
    retryTimeoutId.value = setTimeout(() => {
      loadImage();
    }, delay);
  } else {
    hasError.value = true;
    isRetrying.value = false; // 재시도 실패 시 재시도 상태 해제
    console.error("모든 재시도 실패.");
  }
};

const retryLoad = () => {
  if (retryTimeoutId.value) {
    clearTimeout(retryTimeoutId.value);
    retryTimeoutId.value = null;
  }
  localSrc.value = ""; // 기존 이미지 소스 초기화
  retryCount.value = 0; // 재시도 카운트 초기화
  hasError.value = false; // 에러 상태 초기화
  isRetrying.value = false; // 재시도 대기 상태 초기화
  loadImage(); // 이미지 로드 다시 시작
};

// url, id, 또는 activateLoad가 변경될 때 이미지를 로드합니다.
watch(
  () => [props.url, props.id, activateLoad.value],
  ([_newUrl, _newId, newActivateLoad]) => {
    if (newActivateLoad) {
      // 기존 타임아웃이 있다면 취소
      if (retryTimeoutId.value) {
        clearTimeout(retryTimeoutId.value);
        retryTimeoutId.value = null;
      }
      retryCount.value = 0; // 새 로딩 시도 시 재시도 카운트 초기화
      loadImage();
    }
  },
  { immediate: true }, // 컴포넌트 마운트 시 즉시 실행하여 초기 비-레이지 로드 처리
);

// 컴포넌트 언마운트 시 타이머 정리
onUnmounted(() => {
  if (retryTimeoutId.value) {
    clearTimeout(retryTimeoutId.value);
  }
});
</script>

<template>
  <div class="proxied-image-wrapper w-full h-full min-w-40">
    <!-- 로딩 중 스켈레톤 UI -->
    <div
      v-if="(isLoading && !localSrc) || isRetrying"
      class="w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse rounded"
    ></div>

    <!-- 에러 발생 시 대체 UI (모든 재시도 실패 후) -->
    <div
      v-else-if="hasError"
      class="w-full h-full bg-red-100 dark:bg-red-900/20 flex flex-col items-center justify-center rounded p-2"
    >
      <p class="text-red-500 text-xs text-center mb-2">이미지<br />로드 실패</p>
      <Button
        size="sm"
        variant="outline"
        class="text-xs h-auto py-1 px-2"
        @click="retryLoad"
      >
        다시 로드하기
      </Button>
    </div>

    <!-- 이미지 표시 -->
    <img
      v-else-if="localSrc"
      :src="localSrc"
      :alt="alt"
      class="w-full h-full object-cover"
    />
    <!-- lazy 로딩 시 플레이스홀더 (아직 로딩 시작 안 했을 때) -->
    <div
      v-else
      class="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded"
    >
      <p class="text-muted-foreground text-xs">로딩 대기 중...</p>
    </div>
  </div>
</template>
