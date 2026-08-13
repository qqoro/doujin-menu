<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed } from "vue";

interface CreditSource {
  artists?: string[];
  groups?: string[];
  series?: string[];
  characters?: string[];
}

const props = withDefaults(
  defineProps<{
    gallery: CreditSource;
    /** 작가만 그립니다. 그리드 카드는 3줄만 쓰므로 true */
    compact?: boolean;
  }>(),
  { compact: false },
);

const emit = defineEmits<{
  copy: [term: string];
}>();

/**
 * 그릴 크레딧 줄들.
 *
 * 예전에는 두 카드가 작가·그룹·시리즈·캐릭터마다 거의 같은 `v-for` 블록을
 * 따로 들고 있었습니다. 여덟 덩어리가 조금씩 달라지면서 두 뷰의 표현이
 * 갈라졌습니다. 접두사(`artist:` 등)는 복사할 검색어에 그대로 들어갑니다.
 */
const rows = computed(() => {
  const all = [
    {
      icon: "solar:pen-new-round-linear",
      prefix: "artist",
      names: props.gallery.artists,
    },
    {
      icon: "solar:users-group-rounded-linear",
      prefix: "group",
      names: props.gallery.groups,
    },
    {
      icon: "solar:bookmark-linear",
      prefix: "series",
      names: props.gallery.series,
    },
    {
      icon: "solar:user-linear",
      prefix: "character",
      names: props.gallery.characters,
    },
  ];

  const visible = props.compact ? all.slice(0, 1) : all;
  // 작가는 값이 없어도 "알 수 없음"으로 자리를 지킵니다. 나머지는 뺍니다.
  return visible.filter(
    (row) => row.prefix === "artist" || (row.names && row.names.length > 0),
  );
});
</script>

<template>
  <!--
    compact도 같은 flex 컨테이너를 씁니다. `display: contents`로 박스를 없애면
    부모가 넘긴 여백 클래스가 조용히 죽습니다.
  -->
  <div class="flex flex-wrap gap-x-3.5 gap-y-1">
    <p
      v-for="row in rows"
      :key="row.prefix"
      class="flex min-w-0 items-center gap-1 truncate"
    >
      <Icon :icon="row.icon" class="h-3.5 w-3.5 shrink-0 opacity-70" />
      <template v-if="row.names && row.names.length > 0">
        <template v-for="(name, index) in row.names" :key="name">
          <button
            class="m-0 cursor-pointer border-none bg-transparent p-0 text-left text-current hover:underline"
            @click.stop="emit('copy', `${row.prefix}:${name}`)"
          >
            {{ name }}
          </button>
          <span v-if="index < row.names.length - 1">,&nbsp;</span>
        </template>
      </template>
      <template v-else>알 수 없음</template>
    </p>
  </div>
</template>
