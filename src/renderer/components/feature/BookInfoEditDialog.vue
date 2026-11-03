<script setup lang="ts">
import * as api from "@/api";
import NameListInput from "@/components/common/NameListInput.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLookupData } from "@/composables/useLookupData";
import { isValidGalleryId, joinNameList, parseNameList } from "@/lib/nameList";
import { Icon } from "@iconify/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { toast } from "vue-sonner";
import type { Book, BookInfoFile } from "../../../types/ipc";

const props = defineProps<{
  open: boolean;
  book: Book | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const queryClient = useQueryClient();
const lookup = useLookupData();

const LOOKUP_KEYS = [
  "tags",
  "artists",
  "series",
  "groups",
  "characters",
  "types",
  "languages",
];

const file = ref<BookInfoFile | null>(null);

/** 이 책에 이미 붙어 있는 이름은 목록이 늦게 와도 "라이브러리에 있는 이름"이다 */
const withOwn = (names: string[], own: (string | null)[] = []) => [
  ...new Set([...names, ...own.filter((name): name is string => !!name)]),
];

const pools = computed(() => {
  const own = file.value?.fields;
  return {
    artists: withOwn(
      lookup.artists.value.map((item) => item.name),
      own?.artists,
    ),
    groups: withOwn(
      lookup.groups.value.map((item) => item.name),
      own?.groups,
    ),
    series: withOwn(
      lookup.series.value.map((item) => item.name),
      own?.series,
    ),
    characters: withOwn(
      lookup.characters.value.map((item) => item.name),
      own?.characters,
    ),
    tags: withOwn(
      lookup.tags.value.map((item) => item.name),
      own?.tags,
    ),
    types: withOwn(
      lookup.types.value.map((item) => item.type),
      [own?.type ?? null],
    ),
    languages: withOwn(
      lookup.languages.value.map((item) => item.name),
      [own?.language ?? null],
    ),
  };
});

const form = reactive({
  title: "",
  hitomiId: "",
  type: "",
  language: "",
  artists: "",
  groups: "",
  series: "",
  characters: "",
  tags: "",
});

const isLoading = ref(false);
const loadError = ref<string | null>(null);
const isSaving = ref(false);

const load = async (book: Book) => {
  isLoading.value = true;
  loadError.value = null;
  file.value = null;
  try {
    const data = await api.getBookInfoFile(book.id);
    // 창을 연 사이 다른 책으로 바뀌었으면 늦게 온 응답은 버린다
    if (props.book?.id !== book.id) return;
    file.value = data;
    const { fields } = data;
    Object.assign(form, {
      title: fields.title,
      hitomiId: fields.hitomi_id ?? "",
      type: fields.type ?? "",
      language: fields.language ?? "",
      artists: joinNameList(fields.artists),
      groups: joinNameList(fields.groups),
      series: joinNameList(fields.series),
      characters: joinNameList(fields.characters),
      tags: joinNameList(fields.tags),
    });
  } catch (error) {
    loadError.value = (error as Error).message;
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => [props.open, props.book?.id] as const,
  ([open]) => {
    if (!open || !props.book) return;
    load(props.book);
    // 목록은 페이지가 열릴 때 한 번 받아 둔 것이라 그 뒤 스캔으로 생긴 이름이 빠져 있다
    for (const key of LOOKUP_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  },
  { immediate: true },
);

const galleryIdInvalid = computed(() => !isValidGalleryId(form.hitomiId));
const titleMissing = computed(() => form.title.trim() === "");
const canSave = computed(
  () =>
    !!file.value &&
    !isLoading.value &&
    !isSaving.value &&
    !galleryIdInvalid.value &&
    !titleMissing.value,
);

const firstWord = (text: string) => parseNameList(text)[0] ?? null;

const handleSave = async () => {
  const book = props.book;
  if (!book || !canSave.value) return;
  isSaving.value = true;
  try {
    await api.saveBookInfoFile(book.id, {
      title: form.title.trim(),
      hitomi_id: form.hitomiId.trim() || null,
      type: firstWord(form.type),
      language: firstWord(form.language),
      artists: parseNameList(form.artists),
      groups: parseNameList(form.groups),
      series: parseNameList(form.series),
      characters: parseNameList(form.characters),
      tags: parseNameList(form.tags, { tag: true }),
    });
    // 새 이름이 생겼을 수 있어 자동완성 목록도 다시 받는다
    await Promise.all(
      ["books", ...LOOKUP_KEYS].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
    toast.success("정보를 저장했습니다.");
    emit("update:open", false);
  } catch (error) {
    toast.error("저장 실패", { description: (error as Error).message });
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[85vh] flex-col sm:max-w-[720px]">
      <DialogHeader>
        <DialogTitle>정보 수정</DialogTitle>
        <DialogDescription>
          <template v-if="file?.isArchive">
            압축 파일은 그대로 두고 옆의 info.txt에 저장합니다. 압축 안의
            info.txt보다 우선합니다.
          </template>
          <template v-else>
            저장하면 info.txt를 다시 쓰고 이 작품만 재스캔합니다.
          </template>
          <span v-if="file" class="mt-1 flex gap-1.5 text-xs opacity-80">
            <span class="truncate" :title="file.targetPath">
              {{ file.targetPath }}
            </span>
            <span v-if="!file.targetExists" class="shrink-0">
              (새로 만듭니다)
            </span>
          </span>
        </DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex justify-center py-16">
        <Icon icon="svg-spinners:ring-resize" class="h-8 w-8" />
      </div>
      <p
        v-else-if="loadError"
        class="text-destructive py-10 text-center text-sm"
      >
        {{ loadError }}
      </p>

      <div
        v-else-if="file"
        class="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1"
      >
        <div class="space-y-2">
          <Label for="info-title">제목</Label>
          <Input
            id="info-title"
            v-model="form.title"
            :aria-invalid="titleMissing"
          />
          <p v-if="titleMissing" class="text-destructive text-xs">
            제목을 입력해 주세요.
          </p>
        </div>

        <div class="grid grid-cols-2 items-start gap-4 max-sm:grid-cols-1">
          <div class="space-y-2">
            <Label for="info-artists">작가</Label>
            <NameListInput
              id="info-artists"
              v-model="form.artists"
              :pool="pools.artists"
            />
          </div>
          <div class="space-y-2">
            <Label for="info-groups">그룹</Label>
            <NameListInput
              id="info-groups"
              v-model="form.groups"
              :pool="pools.groups"
            />
          </div>
          <div class="space-y-2">
            <Label for="info-series">시리즈</Label>
            <NameListInput
              id="info-series"
              v-model="form.series"
              :pool="pools.series"
            />
          </div>
          <div class="space-y-2">
            <Label for="info-characters">캐릭터</Label>
            <NameListInput
              id="info-characters"
              v-model="form.characters"
              :pool="pools.characters"
            />
          </div>
        </div>
        <div class="grid grid-cols-3 items-start gap-4 max-sm:grid-cols-1">
          <div class="space-y-2">
            <Label for="info-hitomi-id">갤러리 넘버</Label>
            <Input
              id="info-hitomi-id"
              v-model="form.hitomiId"
              inputmode="numeric"
              :aria-invalid="galleryIdInvalid"
            />
            <p v-if="galleryIdInvalid" class="text-destructive text-xs">
              숫자만 입력할 수 있습니다.
            </p>
          </div>
          <div class="space-y-2">
            <Label for="info-type">타입</Label>
            <NameListInput
              id="info-type"
              v-model="form.type"
              :pool="pools.types"
              single
            />
          </div>
          <div class="space-y-2">
            <Label for="info-language">언어</Label>
            <NameListInput
              id="info-language"
              v-model="form.language"
              :pool="pools.languages"
              single
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="info-tags">태그</Label>
          <NameListInput
            id="info-tags"
            v-model="form.tags"
            :pool="pools.tags"
            tag
          />
          <p class="text-muted-foreground text-xs">
            검색창처럼 띄어쓰기로 구분합니다. 점선 뱃지는 라이브러리에 아직 없는
            이름입니다.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          취소
        </Button>
        <Button :disabled="!canSave" @click="handleSave">
          <Icon
            v-if="isSaving"
            icon="svg-spinners:ring-resize"
            class="h-4 w-4"
          />
          저장
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
