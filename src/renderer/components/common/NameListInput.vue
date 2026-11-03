<script setup lang="ts">
import TagBadge from "@/components/common/TagBadge.vue";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  parseNameList,
  removeNameAt,
  replaceToken,
  suggestNames,
  tokenAt,
} from "@/lib/nameList";
import { Icon } from "@iconify/vue";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";

/**
 * 띄어쓰기로 구분하는 이름 칸. 텍스트가 원본이고 아래 뱃지는 그걸 나눠 보여줄
 * 뿐이다. `single`이면 한 단어짜리 칸이라 뱃지를 그리지 않는다.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** 자동완성 후보이자 "라이브러리에 있는 이름" 판정 기준 */
    pool: readonly string[];
    tag?: boolean;
    single?: boolean;
    id?: string;
    placeholder?: string;
  }>(),
  { tag: false, single: false, id: undefined, placeholder: undefined },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const input = useTemplateRef<InstanceType<typeof Input>>("input");
const caret = ref(0);
const focused = ref(false);
const dismissed = ref(false);
const activeIndex = ref(-1);

const options = computed(() => ({ tag: props.tag }));
const names = computed(() => parseNameList(props.modelValue, options.value));
const known = computed(() => new Set(props.pool));
const token = computed(() => tokenAt(props.modelValue, caret.value));

const suggestions = computed(() =>
  focused.value && !dismissed.value
    ? suggestNames(props.pool, token.value.query, names.value)
    : [],
);
const isOpen = computed(() => suggestions.value.length > 0);

watch(suggestions, () => {
  activeIndex.value = -1;
});

const syncCaret = (event: Event) => {
  const target = event.target as HTMLInputElement;
  caret.value = target.selectionStart ?? props.modelValue.length;
};

const handleInput = (event: Event) => {
  dismissed.value = false;
  emit("update:modelValue", (event.target as HTMLInputElement).value);
  syncCaret(event);
};

const applySuggestion = async (name: string) => {
  const next = props.single
    ? { text: name, caret: name.length }
    : replaceToken(props.modelValue, token.value, name);
  emit("update:modelValue", next.text);
  await nextTick();
  input.value?.setSelectionRange(next.caret, next.caret);
  caret.value = next.caret;
  if (props.single) dismissed.value = true;
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (!isOpen.value) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = Math.min(
      activeIndex.value + 1,
      suggestions.value.length - 1,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === "Tab" || event.key === "Enter") {
    event.preventDefault();
    applySuggestion(suggestions.value[Math.max(activeIndex.value, 0)]);
  } else if (event.key === "Escape") {
    // 후보 목록만 닫는다. 창까지 닫히면 고치던 내용이 날아간다
    event.preventDefault();
    event.stopPropagation();
    dismissed.value = true;
  }
};

const removeTitle = (name: string) =>
  known.value.has(name)
    ? `${name} 빼기`
    : `${name} 빼기 (라이브러리에 없는 이름)`;

const removeAt = (index: number) => {
  emit(
    "update:modelValue",
    removeNameAt(props.modelValue, index, options.value),
  );
};
</script>

<template>
  <div class="space-y-1.5">
    <Popover
      :open="isOpen"
      @update:open="(open: boolean) => !open && (dismissed = true)"
    >
      <PopoverAnchor as-child>
        <div class="w-full">
          <Input
            :id="id"
            ref="input"
            :model-value="modelValue"
            :placeholder="placeholder"
            autocomplete="off"
            spellcheck="false"
            @input="handleInput"
            @keydown="handleKeyDown"
            @keyup="syncCaret"
            @click="syncCaret"
            @focus="focused = true"
            @blur="focused = false"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        :side-offset="4"
        class="w-(--reka-popover-trigger-width) gap-0 p-1"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
      >
        <ul>
          <li
            v-for="(suggestion, index) in suggestions"
            :key="suggestion"
            class="hover:bg-accent cursor-pointer rounded-md px-3 py-1.5 text-sm"
            :class="{ 'bg-accent': index === activeIndex }"
            @mousedown.prevent
            @click="applySuggestion(suggestion)"
          >
            {{ suggestion }}
          </li>
        </ul>
      </PopoverContent>
    </Popover>

    <!-- 점선은 라이브러리에 아직 없는 이름. 오타로 같은 이름이 둘로 갈리는 걸 저장 전에 보여준다 -->
    <div v-if="!single && names.length > 0" class="flex flex-wrap gap-2">
      <template v-for="(name, index) in names" :key="name">
        <TagBadge
          v-if="tag"
          :tag="name"
          role="button"
          class="max-w-xs"
          :class="{
            'outline-1 outline-offset-1 outline-amber-500 outline-dashed':
              !known.has(name),
          }"
          :title="removeTitle(name)"
          @click="removeAt(index)"
        >
          <Icon icon="solar:close-circle-bold-duotone" class="shrink-0" />
        </TagBadge>
        <Badge
          v-else
          variant="secondary"
          role="button"
          class="max-w-xs cursor-pointer gap-1"
          :class="{
            'outline-1 outline-offset-1 outline-amber-500 outline-dashed':
              !known.has(name),
          }"
          :title="removeTitle(name)"
          @click="removeAt(index)"
        >
          <span class="truncate">{{ name }}</span>
          <Icon
            icon="solar:close-circle-bold-duotone"
            class="h-3.5 w-3.5 shrink-0"
          />
        </Badge>
      </template>
    </div>
  </div>
</template>
