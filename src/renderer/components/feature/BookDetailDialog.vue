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
import { computed } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book } from "../../../types/ipc";

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

const displayPath = computed(() => {
  if (!props.book?.path) return "";
  const parts = props.book.path.split(/[\\/]/);
  return parts.slice(0, -1).join("/");
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
          <img
            :src="book.cover_path"
            alt="Book Cover"
            class="h-64 w-auto rounded-lg object-cover shadow-lg"
          />
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
            <div
              v-if="book.language_name_english"
              class="flex items-center gap-2"
            >
              <Icon
                icon="solar:translation-bold-duotone"
                class="text-primary h-5 w-5"
              />
              <Badge
                variant="outline"
                class="hover:bg-accent cursor-pointer"
                @click="copyToClipboard(book.language_name_english, 'language')"
                @contextmenu.prevent="
                  searchInDownloader(book.language_name_english, 'language')
                "
              >
                {{ book.language_name_english }}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        <!-- 태그, 그룹, 캐릭터 -->
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

        <Separator />

        <!-- 기타 정보 -->
        <div class="bg-muted/50 space-y-2 rounded-lg p-4">
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
          <div class="flex flex-col gap-1 text-sm">
            <span class="text-muted-foreground">경로</span>
            <span class="font-mono text-xs break-all">{{ displayPath }}</span>
          </div>
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
