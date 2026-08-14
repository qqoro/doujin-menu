<script setup lang="ts">
import type { CreditPrefix, CreditSource } from "@/lib/cardLayout";
import { Icon } from "@iconify/vue";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    credits: CreditSource;
    /** 그릴 줄. 그리드 카드는 자리가 좁아 일부만 씁니다 */
    fields?: CreditPrefix[];
  }>(),
  { fields: () => ["artist", "group", "series", "character"] },
);

const emit = defineEmits<{
  /** 이름 클릭. 복사할지 필터를 걸지는 화면이 정합니다 */
  select: [credit: { prefix: CreditPrefix; name: string }];
}>();

/**
 * 그릴 크레딧 줄들.
 *
 * 예전에는 카드마다 작가·그룹·시리즈·캐릭터의 거의 같은 `v-for` 블록을 따로
 * 들고 있었습니다. 덩어리가 조금씩 달라지면서 뷰마다 표현이 갈라졌습니다.
 */
const rows = computed(() => {
  const all = [
    {
      icon: "solar:pen-new-round-linear",
      prefix: "artist" as const,
      names: props.credits.artists,
    },
    {
      icon: "solar:users-group-rounded-linear",
      prefix: "group" as const,
      names: props.credits.groups,
    },
    {
      icon: "solar:bookmark-linear",
      prefix: "series" as const,
      names: props.credits.series,
    },
    {
      icon: "solar:user-linear",
      prefix: "character" as const,
      names: props.credits.characters,
    },
  ];

  const visible = all.filter((row) => props.fields.includes(row.prefix));
  // 작가는 값이 없어도 "알 수 없음"으로 자리를 지킵니다. 나머지는 뺍니다.
  return visible.filter(
    (row) => row.prefix === "artist" || (row.names && row.names.length > 0),
  );
});
</script>

<template>
  <!--
    줄이 하나뿐일 때도 같은 flex 컨테이너를 씁니다. `display: contents`로 박스를
    없애면 부모가 넘긴 여백 클래스가 조용히 죽습니다.
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
            @click.stop="emit('select', { prefix: row.prefix, name })"
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
