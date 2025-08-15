<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { useLookupData } from "@/composable/useLookupData";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const isFocused = ref(false);
const suggestions = ref<string[]>([]);
const activeSuggestionIndex = ref(-1);

const availablePrefixes = [
  "id:",
  "artist:",
  "group:",
  "type:",
  "language:",
  "series:",
  "character:",
  "tag:",
];

const implicitTagPrefixes = ["female:", "male:"];

const { artists, tags, series, groups, characters, types, languages } =
  useLookupData();

interface Nameable {
  name: string;
}
interface Typeable {
  type: string;
}

const currentPrefix = computed(() => {
  const lastSpaceIndex = props.modelValue.lastIndexOf(" ");
  const lastWord = props.modelValue.substring(lastSpaceIndex + 1);
  const colonIndex = lastWord.indexOf(":");
  if (colonIndex > -1) {
    return lastWord.substring(0, colonIndex + 1);
  }
  return "";
});

const currentSearchTerm = computed(() => {
  const lastSpaceIndex = props.modelValue.lastIndexOf(" ");
  return props.modelValue.substring(lastSpaceIndex + 1);
});

watch(
  () => props.modelValue,
  (newValue) => {
    const term = currentSearchTerm.value.toLowerCase();
    const prefix = currentPrefix.value;
    const currentTerms = newValue
      .toLowerCase()
      .split(" ")
      .filter((s) => s.length > 0);

    if (term.length === 0 && !manualSuggestTrigger.value) {
      suggestions.value = [];
      activeSuggestionIndex.value = -1;
      return;
    }

    // 제안 가능한 모든 프리픽스 목록 (기본 + 암시적 태그)
    const allSuggestiblePrefixes = [
      ...availablePrefixes,
      ...implicitTagPrefixes,
    ];
    const isImplicitTag = implicitTagPrefixes.some((p) => term.startsWith(p));

    let dataToSuggest: string[] = [];
    let searchTerm = term;
    let suggestionPrefix = "";

    if (isImplicitTag) {
      // 암시적 태그 프리픽스가 입력된 경우 (예: 'female:')
      dataToSuggest = tags.value.map((t: Nameable) => t.name);
      searchTerm = term; // 'female:'로 시작하는 전체 태그를 검색
      suggestionPrefix = ""; // 제안은 'female:big_breasts' 형태가 됨
    } else if (prefix) {
      // 명시적 프리픽스가 입력된 경우 (예: 'tag:')
      suggestionPrefix = prefix;
      searchTerm = term.substring(prefix.length);
      if (prefix === "artist:")
        dataToSuggest = artists.value.map((a: Nameable) => a.name);
      else if (prefix === "group:")
        dataToSuggest = groups.value.map((g: Nameable) => g.name);
      else if (prefix === "type:")
        dataToSuggest = types.value.map((t: Typeable) => t.type);
      else if (prefix === "language:")
        dataToSuggest = languages.value.map((l: Nameable) => l.name);
      else if (prefix === "series:")
        dataToSuggest = series.value.map((s: Nameable) => s.name);
      else if (prefix === "character:")
        dataToSuggest = characters.value.map((c: Nameable) => c.name);
      else if (prefix === "tag:")
        dataToSuggest = tags.value.map((t: Nameable) => t.name);
    }

    if (dataToSuggest.length > 0) {
      // 검색할 데이터가 있는 경우 (프리픽스가 활성화된 상태)
      const filteredSuggestions = dataToSuggest
        .filter((item) => item.toLowerCase().startsWith(searchTerm))
        .map((item) => `${suggestionPrefix}${item}`);

      suggestions.value = filteredSuggestions.filter(
        (s) => !currentTerms.includes(s.toLowerCase()),
      );
    } else if (!prefix) {
      // 프리픽스가 아직 없는 경우, 제안 가능한 모든 프리픽스를 보여줌
      suggestions.value = allSuggestiblePrefixes
        .filter((p) => p.startsWith(term))
        .filter((s) => !currentTerms.includes(s.toLowerCase()));
    } else {
      // 알 수 없는 프리픽스가 입력된 경우
      suggestions.value = [];
    }

    activeSuggestionIndex.value = -1;
  },
);

const applySuggestion = (suggestion: string) => {
  const lastSpaceIndex = props.modelValue.lastIndexOf(" ");
  let newInputValue;
  if (lastSpaceIndex > -1) {
    newInputValue = `${props.modelValue.substring(
      0,
      lastSpaceIndex + 1,
    )}${suggestion}`;
  } else {
    newInputValue = suggestion;
  }
  emit("update:modelValue", newInputValue);

  // 커서를 새로 입력된 단어의 끝으로 이동
  // 다음 틱에서 DOM이 업데이트된 후 커서 위치를 설정
  nextTick(() => {
    if (input.value) {
      // 입력 필드를 텍스트의 끝으로 스크롤하여 커서가 보이도록 함
      input.value.focus();
      input.value.goEnd();
    }
  });
  suggestions.value = [];
};

const input = useTemplateRef<typeof Input>("input");

const manualSuggestTrigger = ref(false);

const showAllPrefixSuggestions = () => {
  const term = currentSearchTerm.value.toLowerCase();
  const allSuggestiblePrefixes = [...availablePrefixes, ...implicitTagPrefixes];

  suggestions.value = allSuggestiblePrefixes
    .filter((p) => p.startsWith(term))
    .filter(
      (s) =>
        !props.modelValue
          .toLowerCase()
          .split(" ")
          .filter((s) => s.length > 0)
          .includes(s.toLowerCase()),
    );
  activeSuggestionIndex.value = -1;
  manualSuggestTrigger.value = false;
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === " ") {
    event.preventDefault();
    manualSuggestTrigger.value = true;
    showAllPrefixSuggestions();
    return;
  }

  if (suggestions.value.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeSuggestionIndex.value = Math.min(
        activeSuggestionIndex.value + 1,
        suggestions.value.length - 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeSuggestionIndex.value = Math.max(
        activeSuggestionIndex.value - 1,
        0,
      );
    } else if (event.key === "Tab" || event.key === "Enter") {
      if (suggestions.value.length > 0) {
        // suggestions가 있을 때만 처리
        event.preventDefault();
        if (activeSuggestionIndex.value === -1) {
          // 포커스 이동 없이 Tab/Enter 누르면 첫 번째 아이템 자동 완성
          applySuggestion(suggestions.value[0]);
        } else {
          // 포커스 이동 후 Tab/Enter 누르면 해당 아이템 자동 완성
          applySuggestion(suggestions.value[activeSuggestionIndex.value]);
        }
      }
    }
  }
};

const focus = () => {
  input.value?.focus();
};

defineExpose({ focus });
</script>

<template>
  <div class="relative w-full">
    <Input
      ref="input"
      :model-value="props.modelValue"
      :placeholder="placeholder"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="handleKeyDown"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <ul
      v-if="suggestions.length > 0 && isFocused"
      class="absolute z-10 w-full bg-popover border rounded-md shadow-lg mt-1"
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :key="suggestion"
        class="px-4 py-2 cursor-pointer hover:bg-accent"
        :class="{ 'bg-accent': index === activeSuggestionIndex }"
        @click="applySuggestion(suggestion)"
      >
        {{ suggestion }}
      </li>
    </ul>
  </div>
</template>
