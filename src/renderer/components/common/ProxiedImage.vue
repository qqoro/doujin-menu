<script setup lang="ts">
import { loadTempThumbnail, peekTempThumbnail } from "@/lib/tempThumbnailCache";
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

const toGalleryId = (id: number | string) =>
  typeof id === "number" ? id : Number.parseInt(id, 10);

/**
 * setup 시점에 캐시를 확인해 초기 상태를 정합니다.
 *
 * `isLoading`을 무조건 true로 시작하면 캐시가 있어도 회색 박스가 한 프레임
 * 그려집니다. 가상 스크롤은 재마운트가 잦아 그게 곧 깜빡임이 됩니다.
 */
const cachedSrc =
  props.url && props.id
    ? (peekTempThumbnail(toGalleryId(props.id), props.url) ?? "")
    : "";

const localSrc = ref<string>(cachedSrc);
const isLoading = ref(!cachedSrc);
const retryCount = ref(0);
/**
 * 현재 `localSrc`가 어느 (id, url)에 해당하는지 추적합니다.
 *
 * **이게 없으면 슬롯 재사용 시 옛 이미지가 남습니다.** 다운로더 가상 스크롤은
 * 카드의 `:key`를 위치(`row.index-col`)로 쓰는데, 창 리사이즈로 열 수가 바뀌면
 * 같은 키의 슬롯에 다른 갤러리가 들어와 이 컴포넌트가 재사용됩니다. 그때
 * `props.id`/`url`은 바뀌지만 `localSrc`에는 옛 갤러리 경로가 그대로라, 아래
 * `loadImage`의 "이미 로드됨" 가드가 새 이미지 로드를 통째로 건너뜁니다.
 * 결과적으로 표지는 옛 순서대로 남고 메타데이터만 바뀌어 이미지가 엉뚱한
 * 순서로 보입니다(예: 1,2,3,1,2,3,...).
 */
const keyFor = (id: number | string, url: string) =>
  `${toGalleryId(id)}\n${url}`;
const loadedKey = ref(cachedSrc ? keyFor(props.id, props.url) : "");
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

  // 같은 (id, url)을 이미 로드했고 로딩 중이 아니면 건너뜁니다.
  // **loadedKey 비교가 빠지면 슬롯 재사용 시 옛 이미지가 갱신되지 않습니다.**
  if (
    localSrc.value &&
    !isLoading.value &&
    retryCount.value === 0 &&
    loadedKey.value === keyFor(props.id, props.url)
  ) {
    return;
  }

  isLoading.value = true;
  isRetrying.value = false; // 로딩 시작 시 재시도 상태 초기화

  try {
    // 모듈 레벨 캐시를 거칩니다. 같은 썸네일이 동시에 여러 번 요청되면
    // 진행 중인 Promise를 공유해 왕복을 하나로 합칩니다
    const path = await loadTempThumbnail(
      toGalleryId(props.id),
      props.url,
      props.referer,
    );

    if (path) {
      localSrc.value = path;
      loadedKey.value = keyFor(props.id, props.url);
      retryCount.value = 0; // 성공 시 재시도 카운트 초기화
    } else {
      console.error("프록시 이미지 로드 실패:", props.url);
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
  retryTimeoutId.value = setTimeout(() => {
    loadImage();
  }, RETRY_DELAY);
};

// url, id, 또는 activateLoad가 변경될 때 이미지를 로드합니다.
watch(
  () => [props.url, props.id, activateLoad.value] as const,
  ([newUrl, newId, newActivateLoad]) => {
    if (!newActivateLoad) return;

    // id/url이 바뀌면(슬롯 재사용) 옛 localSrc를 버립니다. 캐시에 있으면 즉시
    // 올리고, 없으면 비워서 새 이미지가 도착할 때까지 스켈레톤이 나갑니다.
    // 그대로 두면 localSrc가 옛 갤러리 경로라 loadImage 가드가 막혀 버립니다.
    if (newUrl && newId && loadedKey.value !== keyFor(newId, newUrl)) {
      const peeked = peekTempThumbnail(toGalleryId(newId), newUrl) ?? "";
      localSrc.value = peeked;
      loadedKey.value = peeked ? keyFor(newId, newUrl) : "";
      isLoading.value = !peeked;
    }

    // 기존 타임아웃이 있다면 취소
    if (retryTimeoutId.value) {
      clearTimeout(retryTimeoutId.value);
      retryTimeoutId.value = null;
    }
    retryCount.value = 0; // 새 로딩 시도 시 재시도 카운트 초기화
    loadImage();
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
  <!--
    최소 폭을 여기서 강제하지 않습니다. 부모가 정한 폭보다 큰 min-width가 걸리면
    부모의 overflow-hidden에 잘려 표지 가운데만 보입니다. 리스트 썸네일처럼
    폭이 가변인 곳이 여기 걸립니다. 로딩 전 폭이 0으로 무너지면 곤란한
    호출처(미리보기 가로 스크롤)만 각자 min-w를 붙입니다.
  -->
  <div class="proxied-image-wrapper h-full w-full">
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
