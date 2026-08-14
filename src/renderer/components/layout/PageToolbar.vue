<script setup lang="ts">
// 검색·필터 툴바 공용 셸.
//
// 화면마다 컨트롤 순서와 간격이 달라서, 같은 기능을 매번 다른 자리에서 찾아야
// 했다. 순서와 간격은 여기서만 정하고 각 화면은 내용만 채운다.
//
// 슬롯 순서: 검색 → 프리셋 → 필터 → 정렬 → 화면 고유 → 뷰 옵션
// 아랫줄: 결과 상태(왼쪽) / 결과 건수(오른쪽)
//
// 아랫줄 왼쪽에는 지금 걸려 있는 필터 칩이 들어가고, 다운로더처럼 결과 안에서
// 위치를 옮기는 화면은 그 이동 컨트롤이 대신 들어간다.
//
// 창이 좁아지면 wrap으로 넘긴다. 검색창이 끝까지 줄면 아무것도 못 읽으므로
// min-w로 바닥을 깔아, 자리가 모자랄 때 뷰 옵션부터 아랫줄로 내려가게 한다.
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <div v-if="$slots.search" class="min-w-[240px] flex-1">
        <slot name="search" />
      </div>
      <slot name="preset" />
      <slot name="filter" />
      <slot name="sort" />
      <slot name="extra" />
      <div v-if="$slots.view" class="ml-auto flex items-center gap-2">
        <slot name="view" />
      </div>
    </div>

    <div
      v-if="$slots.status || $slots.count"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="status" />
      <div
        v-if="$slots.count"
        class="text-muted-foreground ml-auto text-sm whitespace-nowrap"
      >
        <slot name="count" />
      </div>
    </div>
  </div>
</template>
