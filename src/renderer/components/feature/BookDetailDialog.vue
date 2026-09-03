<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import * as api from "@/api";
import type { Book } from "../../../types/ipc";
import StarRating from "./parts/StarRating.vue";
import { useOptimisticRating } from "@/composables/useOptimisticRating";

const props = defineProps<{
  modelValue: boolean;
  book: Book | null;
}>();

const emit = defineEmits(["update:modelValue"]);

const router = useRouter();

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const queryClient = useQueryClient();

// 모달 하나를 모든 책이 돌려 쓴다. 감시 대상이 왜 별점 값이 아닌 책 자체여야
// 하는지는 useOptimisticRating 참고
const { rating, setRating } = useOptimisticRating(
  () => props.book,
  async (bookId, value) => {
    await api.setBookRating(bookId, value);
    await queryClient.invalidateQueries({ queryKey: ["books"] });
  },
);

const displayPath = computed(() => {
  if (!props.book?.path) return "";
  const parts = props.book.path.split(/[\\/]/);
  return parts.slice(0, -1).join("/");
});

// 표시할 언어명. 카드(lib/bookCard.ts)와 같은 우선순위를 쓴다.
// info.txt에 영문 언어명이 없으면 language_name_english가 비어 있어서,
// 이 폴백이 없으면 목록에는 보이는 언어가 상세에서만 사라진다.
// 검색 조건(bookHandler)도 두 컬럼을 함께 보므로 복사한 language: 검색어가 그대로 동작한다
const displayLanguage = computed(
  () =>
    props.book?.language_name_local || props.book?.language_name_english || "",
);

// 제목 아래 배지가 하나라도 있는지. info.txt 없이 스캔된 책은 전부 비어서
// 구분선만 덩그러니 남으므로 그때는 구분선을 그리지 않는다
const hasBasicMeta = computed(() => {
  const book = props.book;
  if (!book) return false;
  return Boolean(
    book.hitomi_id ||
    book.artists?.length ||
    book.series_name ||
    book.type ||
    displayLanguage.value,
  );
});

// 태그/그룹/캐릭터 섹션에 내용이 있는지. 셋 다 비면 섹션과 구분선을 통째로 숨긴다
const hasTaxonomy = computed(() => {
  const book = props.book;
  if (!book) return false;
  return Boolean(
    book.tags?.length || book.groups?.length || book.characters?.length,
  );
});

// 클립보드 복사 함수
const copyToClipboard = async (text: string, prefix: string) => {
  try {
    const isGenderTag = text.startsWith("male:") || text.startsWith("female:");
    const searchQuery =
      prefix === "tag" && isGenderTag ? text : `${prefix}:${text}`;
    await navigator.clipboard.writeText(searchQuery);
    toast.success(`${searchQuery}가 복사되었습니다.`);
  } catch {
    toast.error("복사 실패");
  }
};

// 다운로더에서 검색 (우클릭)
const searchInDownloader = (text: string, prefix: string) => {
  const isGenderTag = text.startsWith("male:") || text.startsWith("female:");
  const searchQuery =
    prefix === "tag" && isGenderTag ? text : `${prefix}:${text}`;
  localStorage.setItem("downloader-search-query", searchQuery);
  open.value = false;
  router.push("/downloader");
  toast.info(`다운로더로 이동: ${searchQuery}`);
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
      <DialogHeader>
        <DialogTitle>상세 정보</DialogTitle>
        <DialogDescription>
          선택한 만화책의 상세 정보를 확인합니다. 클릭 시 검색어 형식으로 복사 /
          우클릭 시 다운로더에서 검색
        </DialogDescription>
      </DialogHeader>
      <div v-if="book" class="space-y-6 py-4">
        <!-- 커버 이미지와 기본 정보 -->
        <div class="flex gap-6">
          <!-- 세로 표지든 가로로 긴 이미지든 같은 자리를 차지하도록 2:3 프레임에
               레터박스로 넣는다. 이미지 비율에 따라 옆 열 폭이 흔들리지 않는다 -->
          <div
            class="bg-muted aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-lg shadow-lg"
          >
            <img
              :src="book.cover_path"
              alt="Book Cover"
              class="h-full w-full object-contain"
            />
          </div>
          <div class="flex flex-1 flex-col gap-3">
            <h3 class="text-2xl leading-tight font-bold">{{ book.title }}</h3>

            <!-- Hitomi ID -->
            <div v-if="book.hitomi_id" class="flex items-center gap-2 text-sm">
              <Icon
                icon="solar:hashtag-circle-bold-duotone"
                class="text-primary h-5 w-5"
              />
              <Badge
                variant="secondary"
                class="hover:bg-secondary/80 cursor-pointer"
                @click="copyToClipboard(book.hitomi_id, 'id')"
                @contextmenu.prevent="searchInDownloader(book.hitomi_id, 'id')"
              >
                ID: {{ book.hitomi_id }}
              </Badge>
            </div>

            <!-- 작가 -->
            <div
              v-if="book.artists && book.artists.length > 0"
              class="flex items-start gap-2"
            >
              <Icon
                icon="solar:user-bold-duotone"
                class="text-primary mt-0.5 h-5 w-5"
              />
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="artist in book.artists"
                  :key="artist.name"
                  variant="outline"
                  class="hover:bg-accent cursor-pointer"
                  @click="copyToClipboard(artist.name, 'artist')"
                  @contextmenu.prevent="
                    searchInDownloader(artist.name, 'artist')
                  "
                >
                  {{ artist.name }}
                </Badge>
              </div>
            </div>

            <!-- 시리즈 -->
            <div v-if="book.series_name" class="flex items-center gap-2">
              <Icon
                icon="solar:library-bold-duotone"
                class="text-primary h-5 w-5"
              />
              <Badge
                variant="outline"
                class="hover:bg-accent cursor-pointer"
                @click="copyToClipboard(book.series_name, 'series')"
                @contextmenu.prevent="
                  searchInDownloader(book.series_name, 'series')
                "
              >
                {{ book.series_name }}
              </Badge>
            </div>

            <!-- 유형 -->
            <div v-if="book.type" class="flex items-center gap-2">
              <Icon
                icon="solar:bookmark-bold-duotone"
                class="text-primary h-5 w-5"
              />
              <Badge
                variant="outline"
                class="hover:bg-accent cursor-pointer"
                @click="copyToClipboard(book.type, 'type')"
                @contextmenu.prevent="searchInDownloader(book.type, 'type')"
              >
                {{ book.type }}
              </Badge>
            </div>

            <!-- 언어 -->
            <div v-if="displayLanguage" class="flex items-center gap-2">
              <Icon
                icon="solar:translation-bold-duotone"
                class="text-primary h-5 w-5"
              />
              <Badge
                variant="outline"
                class="hover:bg-accent cursor-pointer"
                @click="copyToClipboard(displayLanguage, 'language')"
                @contextmenu.prevent="
                  searchInDownloader(displayLanguage, 'language')
                "
              >
                {{ displayLanguage }}
              </Badge>
            </div>

            <!-- 기타 정보. 메타데이터가 없는 책이면 제목 말고는 이 열에 아무것도
                 남지 않아 표지 옆이 통째로 비므로, 아래 박스에 두지 않고 여기 붙인다 -->
            <div class="space-y-2" :class="hasBasicMeta ? 'border-t pt-3' : ''">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">페이지 수</span>
                <span class="font-medium">{{ book.page_count }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">추가된 날짜</span>
                <span class="font-medium">
                  {{
                    book.added_at
                      ? new Date(book.added_at).toLocaleDateString()
                      : "-"
                  }}
                </span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">마지막 읽은 날짜</span>
                <span class="font-medium">
                  {{
                    book.last_read_at
                      ? new Date(book.last_read_at).toLocaleDateString()
                      : "없음"
                  }}
                </span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">즐겨찾기</span>
                <span class="font-medium">
                  <Icon
                    v-if="book.is_favorite"
                    icon="solar:star-bold"
                    class="text-yellow-500"
                  />
                  <span v-else>-</span>
                </span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">별점</span>
                <StarRating
                  :model-value="rating"
                  @update:model-value="setRating"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 태그, 그룹, 캐릭터. 셋 다 비면 구분선까지 함께 사라진다 -->
        <template v-if="hasTaxonomy">
          <Separator />

          <div class="space-y-4">
            <!-- 태그 -->
            <div v-if="book.tags && book.tags.length > 0">
              <div class="mb-2 flex items-center gap-2">
                <Icon
                  icon="solar:tag-bold-duotone"
                  class="text-primary h-5 w-5"
                />
                <span class="text-sm font-semibold">태그</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="tag in book.tags"
                  :key="tag.name"
                  variant="secondary"
                  class="hover:bg-secondary/80 cursor-pointer"
                  @click="copyToClipboard(tag.name, 'tag')"
                  @contextmenu.prevent="searchInDownloader(tag.name, 'tag')"
                >
                  {{ tag.name }}
                </Badge>
              </div>
            </div>

            <!-- 그룹 -->
            <div v-if="book.groups && book.groups.length > 0">
              <div class="mb-2 flex items-center gap-2">
                <Icon
                  icon="solar:users-group-rounded-bold-duotone"
                  class="text-primary h-5 w-5"
                />
                <span class="text-sm font-semibold">그룹</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="group in book.groups"
                  :key="group.name"
                  variant="secondary"
                  class="hover:bg-secondary/80 cursor-pointer"
                  @click="copyToClipboard(group.name, 'group')"
                  @contextmenu.prevent="searchInDownloader(group.name, 'group')"
                >
                  {{ group.name }}
                </Badge>
              </div>
            </div>

            <!-- 캐릭터 -->
            <div v-if="book.characters && book.characters.length > 0">
              <div class="mb-2 flex items-center gap-2">
                <Icon
                  icon="solar:user-speak-bold-duotone"
                  class="text-primary h-5 w-5"
                />
                <span class="text-sm font-semibold">캐릭터</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="character in book.characters"
                  :key="character.name"
                  variant="secondary"
                  class="hover:bg-secondary/80 cursor-pointer"
                  @click="copyToClipboard(character.name, 'character')"
                  @contextmenu.prevent="
                    searchInDownloader(character.name, 'character')
                  "
                >
                  {{ character.name }}
                </Badge>
              </div>
            </div>
          </div>
        </template>

        <!-- 경로. 한 줄이 길어 오른쪽 열에 두면 표지 옆이 좁아지므로 전폭으로 뺀다 -->
        <div class="bg-muted/50 flex flex-col gap-1 rounded-lg p-4 text-sm">
          <span class="text-muted-foreground">경로</span>
          <span class="font-mono text-xs break-all">{{ displayPath }}</span>
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="secondary" @click="open = false">닫기</Button>
        </div>
      </div>
      <div v-else class="text-muted-foreground py-8 text-center">
        책 정보를 불러올 수 없습니다.
      </div>
    </DialogContent>
  </Dialog>
</template>
