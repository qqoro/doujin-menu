<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"; // ContextMenu 관련 컴포넌트 임포트
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@iconify/vue";
import { computed, toRaw } from "vue";
import { RouterLink } from "vue-router";

interface Tag {
  name: string;
}

interface Artist {
  name: string;
}

interface Book {
  id: number;
  title: string;
  cover_path: string | null;
  tags: Tag[];
  artists: Artist[];
  is_favorite: boolean;
  path: string;
}

const props = defineProps<{ book: Book; queryKey: unknown[] }>();
const emit = defineEmits([
  "selectTag",
  "selectArtist",
  "toggle-favorite",
  "open-book-folder",
  "show-details", // 상세 정보 이벤트를 추가합니다.
]);

const viewerLink = computed(() => ({
  name: "Viewer",
  params: { id: props.book.id },
  query: {
    filter: JSON.stringify(toRaw(props.queryKey[1])),
  },
}));

const MAX_VISIBLE_TAGS = 3;

const coverUrl = computed(() => {
  return props.book.cover_path
    ? `file://${props.book.cover_path}`
    : "https://via.placeholder.com/256x384";
});

const visibleTags = computed(() => {
  if (!props.book.tags) return [];
  return props.book.tags.slice(0, MAX_VISIBLE_TAGS);
});

const hiddenTagsCount = computed(() => {
  if (!props.book.tags) return 0;
  return props.book.tags.length - MAX_VISIBLE_TAGS;
});

const handleTagClick = (tag: { name: string }) => {
  emit("selectTag", tag.name);
};

const handleArtistClick = (artist: { name: string }) => {
  emit("selectArtist", artist.name);
};

const getTagDisplayInfo = (tag: { name: string }) => {
  let className = "text-xs px-1.5 py-0.5 rounded-full cursor-pointer";
  let displayText = tag.name;

  if (tag.name.startsWith("female:")) {
    className +=
      " bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100 hover:bg-pink-200 dark:hover:bg-pink-700";
    displayText = tag.name.substring("female:".length);
  } else if (tag.name.startsWith("male:")) {
    className +=
      " bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700";
    displayText = tag.name.substring("male:".length);
  } else {
    className +=
      " bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700";
  }

  return { className, displayText };
};

const toggleFavorite = () => {
  emit("toggle-favorite", props.book.id, props.book.is_favorite);
};

const openBookFolder = () => {
  emit("open-book-folder", props.book.path);
};
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger>
      <RouterLink :to="viewerLink">
        <Card
          class="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full py-0 gap-0"
        >
          <CardContent class="p-0">
            <img
              :src="coverUrl"
              :alt="book.title"
              class="aspect-[2/3] w-full h-auto object-cover"
            />
          </CardContent>
          <CardFooter class="p-2 flex-col items-start flex-grow gap-1">
            <p
              class="font-semibold text-sm truncate w-full"
              :title="book.title"
            >
              {{ book.title }}
            </p>
            <p
              class="text-xs text-muted-foreground truncate w-full mb-1 cursor-pointer hover:underline"
              :title="book.artists?.map((a) => a.name).join(', ')"
              @click.prevent.stop="handleArtistClick(book.artists[0])"
            >
              {{
                book.artists?.map((a) => a.name).join(", ") || "작가 정보 없음"
              }}
            </p>
            <div class="flex flex-wrap items-start gap-1 w-full min-h-[42px]">
              <Badge
                v-for="tag in visibleTags"
                :key="tag"
                :class="getTagDisplayInfo(tag).className"
                @click.prevent.stop="handleTagClick(tag)"
              >
                {{ getTagDisplayInfo(tag).displayText }}
              </Badge>
              <TooltipProvider v-if="hiddenTagsCount > 0" :delay-duration="100">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Badge
                      variant="secondary"
                      class="cursor-pointer"
                      @click.prevent.stop
                    >
                      +{{ hiddenTagsCount }}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    class="max-w-[300px] p-2 bg-primary/50 backdrop-blur-md"
                    @click.prevent.stop
                  >
                    <div class="flex flex-wrap gap-1">
                      <Badge
                        v-for="tag in book.tags"
                        :key="`tooltip-${tag}`"
                        :class="getTagDisplayInfo(tag).className"
                        @click.prevent.stop="handleTagClick(tag)"
                      >
                        {{ getTagDisplayInfo(tag).displayText }}
                      </Badge>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardFooter>
        </Card>
      </RouterLink>
    </ContextMenuTrigger>

    <ContextMenuContent>
      <ContextMenuItem @click="toggleFavorite">
        <Icon
          :icon="
            book.is_favorite
              ? 'solar:heart-broken-line-duotone'
              : 'solar:heart-bold-duotone'
          "
          class="w-4 h-4"
        />
        {{ book.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가" }}
      </ContextMenuItem>
      <ContextMenuItem @click="openBookFolder">
        <Icon icon="solar:folder-open-bold-duotone" class="w-4 h-4" />
        폴더 열기
      </ContextMenuItem>
      <ContextMenuItem @click="emit('show-details', book)">
        <Icon icon="solar:info-circle-bold-duotone" class="w-4 h-4" />
        상세 정보
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
