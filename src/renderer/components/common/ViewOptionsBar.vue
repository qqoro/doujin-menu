<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";

// 썸네일 줌 + 뷰 모드 전환.
//
// 예전에는 화면마다 더보기 드롭다운 / 토글그룹 / 스테퍼로 갈려 있었다.
// 자주 만지는 값이라 숨기지 않고 툴바 오른쪽 끝에 항상 내놓는다.
withDefaults(
  defineProps<{
    modelValue: "grid" | "list";
    /** 줌이 화면에 영향을 주지 않으면 끈다 (예: 시리즈는 고정 그리드) */
    showZoom?: boolean;
    /** 현재 뷰에서 줌이 안 먹는 경우에만 (예: 읽음 기록의 리스트 뷰) */
    zoomDisabled?: boolean;
  }>(),
  { showZoom: true, zoomDisabled: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: "grid" | "list"];
}>();

const uiStore = useUiStore();

// ToggleGroup은 켜져 있는 항목을 다시 누르면 빈 값을 준다. 뷰 모드는 항상
// 하나가 켜져 있어야 하므로 빈 값은 흘려보낸다
const handleChange = (value: unknown) => {
  if (value === "grid" || value === "list") {
    emit("update:modelValue", value);
  }
};
</script>

<template>
  <div
    v-if="showZoom"
    class="inline-flex h-8 items-center rounded-md border"
    :class="zoomDisabled ? 'opacity-50' : ''"
  >
    <Button
      variant="ghost"
      size="icon"
      class="h-full w-8 rounded-r-none border-r"
      aria-label="썸네일 축소"
      :disabled="zoomDisabled"
      @click="uiStore.zoomOut()"
    >
      <Icon icon="solar:minus-circle-bold-duotone" class="h-4 w-4" />
    </Button>
    <div class="flex w-12 items-center justify-center text-xs tabular-nums">
      {{ Math.round(uiStore.thumbnailZoom * 100) }}%
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="h-full w-8 rounded-l-none border-l"
      aria-label="썸네일 확대"
      :disabled="zoomDisabled"
      @click="uiStore.zoomIn()"
    >
      <Icon icon="solar:add-circle-bold-duotone" class="h-4 w-4" />
    </Button>
  </div>

  <ToggleGroup
    :model-value="modelValue"
    type="single"
    @update:model-value="handleChange"
  >
    <ToggleGroupItem value="grid" aria-label="그리드 뷰">
      <Icon icon="solar:widget-4-bold-duotone" class="h-4 w-4" />
    </ToggleGroupItem>
    <ToggleGroupItem value="list" aria-label="리스트 뷰">
      <Icon icon="solar:list-bold-duotone" class="h-4 w-4" />
    </ToggleGroupItem>
  </ToggleGroup>
</template>
