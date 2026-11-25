<script setup lang="ts">
import type { CardStatus } from "@/lib/galleryCard";
import type { GalleryDto } from "@/../types/ipc";
import GalleryMiniRow from "./GalleryMiniRow.vue";

defineProps<{
  /** 연관 작품 id. 상세가 오기 전에도 개수와 스켈레톤 줄 수를 정한다 */
  ids: number[];
  galleries: GalleryDto[];
  loading: boolean;
  failed: boolean;
  resolveStatus: (id: number) => CardStatus;
}>();

const emit = defineEmits<{ select: [gallery: GalleryDto] }>();
</script>

<template>
  <section v-if="ids.length > 0" class="flex min-h-0 flex-1 flex-col">
    <h3 class="mb-1 ml-1.5 text-sm font-semibold">
      연관 작품
      <span class="text-muted-foreground ml-0.5 font-normal">
        {{ ids.length }}
      </span>
    </h3>

    <ul
      v-if="loading"
      class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      aria-busy="true"
    >
      <li
        v-for="id in ids"
        :key="id"
        class="flex items-center gap-2.5 px-1.5 py-1"
      >
        <div class="bg-muted aspect-3/4 w-12 shrink-0 animate-pulse rounded" />
        <div class="flex-1 space-y-1.5">
          <div class="bg-muted h-3 w-4/5 animate-pulse rounded" />
          <div class="bg-muted h-2.5 w-1/2 animate-pulse rounded" />
        </div>
      </li>
    </ul>

    <p
      v-else-if="failed || galleries.length === 0"
      class="text-muted-foreground px-1.5 py-2 text-sm"
    >
      연관 작품을 불러오지 못했습니다.
    </p>

    <ul v-else class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <GalleryMiniRow
        v-for="gallery in galleries"
        :key="gallery.id"
        :gallery="gallery"
        :status="resolveStatus(gallery.id)"
        @select="emit('select', $event)"
      />
    </ul>
  </section>
</template>
