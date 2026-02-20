<script setup lang="ts">
import { ipcRenderer } from "@/api";
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
const retryCount = ref(0);
const retryTimeoutId = ref<NodeJS.Timeout | null>(null);
const isRetrying = ref(false); // 재시도 대기 중 상태

const RETRY_DELAY = 3000; // 3초 간격으로 무한 재시도

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
    isLoading.value = false;
    return;
  }

  // 이미 로드된 이미지이고, 현재 로딩 중이 아닌 경우
  if (localSrc.value && !isLoading.value && retryCount.value === 0) {
    return;
  }

  isLoading.value = true;
  isRetrying.value = false; // 로딩 시작 시 재시도 상태 초기화

  try {
    const result = await ipcRenderer.invoke("download-temp-thumbnail", {
      url: props.url,
      referer: props.referer,
      galleryId:
        typeof props.id === "number" ? props.id : Number.parseInt(props.id, 10),
    });

    if (result.success && result.data) {
      localSrc.value = result.data;
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
  // 3초 간격으로 무한 재시도
  retryCount.value++;
  isRetrying.value = true; // 재시도 대기 상태로 변경
  console.log(`${RETRY_DELAY / 1000}초 후 재시도 (${retryCount.value}회)`);
  retryTimeoutId.value = setTimeout(() => {
    loadImage();
  }, RETRY_DELAY);
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
  <div class="proxied-image-wrapper h-full w-full min-w-40">
    <!-- 로딩 중 스켈레톤 UI -->
    <div
      v-if="(isLoading && !localSrc) || isRetrying"
      class="h-full w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700"
    ></div>

    <!-- 이미지 표시 -->
    <img
      v-else-if="localSrc"
      :src="localSrc"
      :alt="alt"
      class="h-full w-full object-cover"
    />
    <!-- lazy 로딩 시 플레이스홀더 (아직 로딩 시작 안 했을 때) -->
    <div
      v-else
      class="flex h-full w-full items-center justify-center rounded bg-gray-100 dark:bg-gray-800"
    >
      <p class="text-muted-foreground text-xs">로딩 대기 중...</p>
    </div>
  </div>
</template>
