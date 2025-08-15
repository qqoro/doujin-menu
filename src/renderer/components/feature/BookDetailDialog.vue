<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Book } from "@/main/db/types";
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  book: Book | null;
}>();

const emit = defineEmits(["update:modelValue"]);

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const displayPath = computed(() => {
  if (!props.book?.path) return "";
  const parts = props.book.path.split(/[\\/]/);
  return parts.slice(0, -1).join("/");
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>상세 정보</DialogTitle>
        <DialogDescription>
          선택한 만화책의 상세 정보를 확인합니다.
        </DialogDescription>
      </DialogHeader>
      <div v-if="book" class="grid gap-4 py-4">
        <div class="flex items-center gap-4">
          <img
            :src="book.cover_path"
            alt="Book Cover"
            class="w-32 h-auto object-cover rounded-md shadow-md"
          />
          <div class="grid gap-1.5">
            <h3 class="text-2xl font-bold">{{ book.title }}</h3>
            <p class="text-sm text-muted-foreground">
              <span v-if="book.hitomi_id">ID: {{ book.hitomi_id }}</span>
              <span v-else>ID 정보 없음</span>
            </p>
            <p class="text-sm text-muted-foreground">
              <span v-if="book.artists && book.artists.length > 0">
                {{ book.artists.map((a) => a.name).join(", ") }}
              </span>
              <span v-else>작가 미상</span>
            </p>
            <p class="text-sm text-muted-foreground">
              <span v-if="book.series_name"
                >시리즈: {{ book.series_name }}</span
              >
              <span v-else>시리즈 정보 없음</span>
            </p>
            <p class="text-sm text-muted-foreground">
              페이지 수: {{ book.page_count }}
            </p>
            <p class="text-sm text-muted-foreground">
              추가된 날짜: {{ new Date(book.added_at).toLocaleDateString() }}
            </p>
            <p class="text-sm text-muted-foreground">
              마지막 읽은 날짜:
              {{
                book.last_read_at
                  ? new Date(book.last_read_at).toLocaleDateString()
                  : "없음"
              }}
            </p>
            <p class="text-sm text-muted-foreground">경로: {{ displayPath }}</p>
            <p class="text-sm text-muted-foreground">
              즐겨찾기: {{ book.is_favorite ? "예" : "아니오" }}
            </p>
            <p class="text-sm text-muted-foreground">
              태그:
              <span v-if="book.tags && book.tags.length > 0">
                {{ book.tags.map((t) => t.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-sm text-muted-foreground">
              그룹:
              <span v-if="book.groups && book.groups.length > 0">
                {{ book.groups.map((g) => g.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-sm text-muted-foreground">
              캐릭터:
              <span v-if="book.characters && book.characters.length > 0">
                {{ book.characters.map((c) => c.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-sm text-muted-foreground">
              유형: {{ book.type || "알 수 없음" }}
            </p>
            <p class="text-sm text-muted-foreground">
              언어: {{ book.language_name_english || "알 수 없음" }}
            </p>
          </div>
        </div>

        <div class="flex justify-end mt-4">
          <Button variant="secondary" @click="open = false">닫기</Button>
        </div>
      </div>
      <div v-else class="text-center py-8 text-muted-foreground">
        책 정보를 불러올 수 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
