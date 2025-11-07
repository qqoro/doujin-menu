<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Book } from "../../../types/ipc";
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
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
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
            class="h-auto w-32 rounded-md object-cover shadow-md"
          />
          <div class="grid gap-1.5">
            <h3 class="text-2xl font-bold">{{ book.title }}</h3>
            <p class="text-muted-foreground text-sm">
              <span v-if="book.hitomi_id">ID: {{ book.hitomi_id }}</span>
              <span v-else>ID 정보 없음</span>
            </p>
            <p class="text-muted-foreground text-sm">
              <span v-if="book.artists && book.artists.length > 0">
                {{ book.artists.map((a) => a.name).join(", ") }}
              </span>
              <span v-else>작가 미상</span>
            </p>
            <p class="text-muted-foreground text-sm">
              <span v-if="book.series_name"
                >시리즈: {{ book.series_name }}</span
              >
              <span v-else>시리즈 정보 없음</span>
            </p>
            <p class="text-muted-foreground text-sm">
              페이지 수: {{ book.page_count }}
            </p>
            <p class="text-muted-foreground text-sm">
              추가된 날짜:
              {{
                book.added_at
                  ? new Date(book.added_at).toLocaleDateString()
                  : "-"
              }}
            </p>
            <p class="text-muted-foreground text-sm">
              마지막 읽은 날짜:
              {{
                book.last_read_at
                  ? new Date(book.last_read_at).toLocaleDateString()
                  : "없음"
              }}
            </p>
            <p class="text-muted-foreground text-sm">경로: {{ displayPath }}</p>
            <p class="text-muted-foreground text-sm">
              즐겨찾기: {{ book.is_favorite ? "예" : "아니오" }}
            </p>
            <p class="text-muted-foreground text-sm">
              태그:
              <span v-if="book.tags && book.tags.length > 0">
                {{ book.tags.map((t) => t.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-muted-foreground text-sm">
              그룹:
              <span v-if="book.groups && book.groups.length > 0">
                {{ book.groups.map((g) => g.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-muted-foreground text-sm">
              캐릭터:
              <span v-if="book.characters && book.characters.length > 0">
                {{ book.characters.map((c) => c.name).join(", ") }}
              </span>
              <span v-else>없음</span>
            </p>
            <p class="text-muted-foreground text-sm">
              유형: {{ book.type || "알 수 없음" }}
            </p>
            <p class="text-muted-foreground text-sm">
              언어: {{ book.language_name_english || "알 수 없음" }}
            </p>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <Button variant="secondary" @click="open = false">닫기</Button>
        </div>
      </div>
      <div v-else class="text-muted-foreground py-8 text-center">
        책 정보를 불러올 수 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
