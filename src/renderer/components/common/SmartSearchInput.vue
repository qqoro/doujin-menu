<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { useLookupData } from "@/composable/useLookupData";
import { Icon } from "@iconify/vue";
import { watchDebounced } from "@vueuse/core";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { toast } from "vue-sonner";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const clearInput = () => {
  emit("update:modelValue", "");
};

const pasteFromClipboard = async () => {
  emit("update:modelValue", await navigator.clipboard.readText());
};

const copyToClipboard = () => {
  if (props.modelValue) {
    navigator.clipboard.writeText(props.modelValue);
    toast.success("복사 되었습니다.");
  }
};

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

// 제안 가능한 모든 프리픽스 목록
const allSuggestiblePrefixes = [...availablePrefixes, ...implicitTagPrefixes];

const { artists, tags, series, groups, characters, types, languages } =
  useLookupData();

interface Nameable {
  name: string;
}
interface Typeable {
  type: string;
}

// 미리 computed로 이름 배열 생성 (매 입력마다 map() 호출 방지)
const tagNames = computed(() => tags.value.map((t: Nameable) => t.name));
const artistNames = computed(() => artists.value.map((a: Nameable) => a.name));
const seriesNames = computed(() => series.value.map((s: Nameable) => s.name));
const groupNames = computed(() => groups.value.map((g: Nameable) => g.name));
const characterNames = computed(() =>
  characters.value.map((c: Nameable) => c.name),
);
const typeNames = computed(() => types.value.map((t: Typeable) => t.type));
const languageNames = computed(() =>
  languages.value.map((l: Nameable) => l.name),
);

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

// 태그 이름에서 성별 접두사(female:/male:)를 떼어낸 핵심 부분을 반환
const stripGenderPrefix = (name: string): string => {
  for (const p of implicitTagPrefixes) {
    if (name.toLowerCase().startsWith(p)) return name.slice(p.length);
  }
  return name;
};

// 프리픽스 없이 입력한 단어에 대해 모든 메타데이터(태그/작가/그룹/시리즈/캐릭터/타입/언어)에서
// 매칭 후보를 수집한다. 선택 시 검색이 동작하도록 알맞은 프리픽스를 붙여 완성 문자열을 만든다.
const collectDataSuggestions = (
  term: string,
  currentTerms: Set<string>,
): string[] => {
  const MAX_SUGGESTIONS = 30;
  const out: string[] = [];

  const tryPush = (suggestion: string) => {
    if (out.length >= MAX_SUGGESTIONS) return;
    if (currentTerms.has(suggestion.toLowerCase())) return;
    if (out.includes(suggestion)) return;
    out.push(suggestion);
  };

  // 태그: 성별 접두사를 떼어낸 부분으로 매칭하되,
  // 성별 태그는 저장된 형태 그대로(female:xxx), 일반 태그는 tag: 프리픽스를 붙여 제안
  for (const name of tagNames.value) {
    if (out.length >= MAX_SUGGESTIONS) break;
    const core = stripGenderPrefix(name).toLowerCase();
    if (!core.startsWith(term)) continue;
    const hasGender = core !== name.toLowerCase();
    tryPush(hasGender ? name : `tag:${name}`);
  }

  // 그 외 카테고리: 해당 프리픽스를 붙여 제안
  const categories: { prefix: string; names: string[] }[] = [
    { prefix: "artist:", names: artistNames.value },
    { prefix: "group:", names: groupNames.value },
    { prefix: "series:", names: seriesNames.value },
    { prefix: "character:", names: characterNames.value },
    { prefix: "type:", names: typeNames.value },
    { prefix: "language:", names: languageNames.value },
  ];
  for (const { prefix, names } of categories) {
    for (const name of names) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (!name.toLowerCase().startsWith(term)) continue;
      tryPush(`${prefix}${name}`);
    }
  }

  return out;
};

// 프리픽스 제안 (즉시 반응, 데이터 양이 적어 debounce 불필요)
watch(
  () => props.modelValue,
  (newValue) => {
    const term = currentSearchTerm.value.toLowerCase();
    const prefix = currentPrefix.value;

    // 프리픽스가 없고 입력 중일 때만 프리픽스 제안
    if (!prefix && term.length > 0) {
      const currentTerms = new Set(
        newValue
          .toLowerCase()
          .split(" ")
          .filter((s: string) => s.length > 0),
      );
      suggestions.value = allSuggestiblePrefixes
        .filter((p: string) => p.startsWith(term))
        .filter((s: string) => !currentTerms.has(s.toLowerCase()));
      activeSuggestionIndex.value = -1;
    }
  },
);

// 태그/아티스트 제안 (300ms debounce로 타이핑 중 불필요한 연산 방지)
watchDebounced(
  () => props.modelValue,
  (newValue) => {
    const term = currentSearchTerm.value.toLowerCase();
    const prefix = currentPrefix.value;
    const currentTerms = new Set(
      newValue
        .toLowerCase()
        .split(" ")
        .filter((s) => s.length > 0),
    );

    if (term.length === 0 && !manualSuggestTrigger.value) {
      suggestions.value = [];
      activeSuggestionIndex.value = -1;
      return;
    }

    const isImplicitTag = implicitTagPrefixes.some((p) => term.startsWith(p));

    let dataToSuggest: string[] = [];
    let searchTerm = term;
    let suggestionPrefix = "";

    if (isImplicitTag) {
      // 암시적 태그 프리픽스가 입력된 경우 (예: 'female:')
      dataToSuggest = tagNames.value;
      searchTerm = term; // 'female:'로 시작하는 전체 태그를 검색
      suggestionPrefix = ""; // 제안은 'female:big_breasts' 형태가 됨
    } else if (prefix) {
      // 명시적 프리픽스가 입력된 경우 (예: 'tag:')
      suggestionPrefix = prefix;
      searchTerm = term.substring(prefix.length);
      if (prefix === "artist:") dataToSuggest = artistNames.value;
      else if (prefix === "group:") dataToSuggest = groupNames.value;
      else if (prefix === "type:") dataToSuggest = typeNames.value;
      else if (prefix === "language:") dataToSuggest = languageNames.value;
      else if (prefix === "series:") dataToSuggest = seriesNames.value;
      else if (prefix === "character:") dataToSuggest = characterNames.value;
      else if (prefix === "tag:") dataToSuggest = tagNames.value;
    }

    if (dataToSuggest.length > 0) {
      // 검색할 데이터가 있는 경우 (프리픽스가 활성화된 상태)
      const MAX_SUGGESTIONS = 30;
      const filteredSuggestions: string[] = [];

      for (const item of dataToSuggest) {
        if (filteredSuggestions.length >= MAX_SUGGESTIONS) break;
        if (!item.toLowerCase().startsWith(searchTerm)) continue;

        const suggestion = `${suggestionPrefix}${item}`;
        if (!currentTerms.has(suggestion.toLowerCase())) {
          filteredSuggestions.push(suggestion);
        }
      }

      suggestions.value = filteredSuggestions;
    } else if (prefix) {
      // 알 수 없는 프리픽스가 입력된 경우
      suggestions.value = [];
    } else {
      // 프리픽스가 아직 없는 경우: 프리픽스 후보 + 모든 메타데이터 매칭 후보를 함께 제안
      const prefixSuggestions = allSuggestiblePrefixes
        .filter((p: string) => p.startsWith(term))
        .filter((s: string) => !currentTerms.has(s.toLowerCase()));
      suggestions.value = [
        ...prefixSuggestions,
        ...collectDataSuggestions(term, currentTerms),
      ];
    }

    activeSuggestionIndex.value = -1;
  },
  { debounce: 300 },
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
      :class="['w-full', props.modelValue.length > 0 ? 'pr-20' : 'pr-12']"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="handleKeyDown"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <div
      v-if="props.modelValue.length > 0"
      class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3"
    >
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-1 transition-colors"
        @click="clearInput"
      >
        <Icon icon="solar:close-circle-bold-duotone" class="h-5 w-5" />
      </button>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-1 transition-colors"
        @click="copyToClipboard"
      >
        <Icon icon="solar:copy-bold-duotone" class="h-5 w-5" />
      </button>
    </div>
    <div v-else class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-1 transition-colors"
        @click="pasteFromClipboard"
      >
        <Icon icon="solar:clipboard-text-bold-duotone" class="h-5 w-5" />
      </button>
    </div>
    <ul
      v-if="suggestions.length > 0 && isFocused"
      class="bg-popover absolute z-10 mt-1 w-full rounded-md border shadow-lg"
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :key="suggestion"
        class="hover:bg-accent cursor-pointer px-4 py-2"
        :class="{ 'bg-accent': index === activeSuggestionIndex }"
        @mousedown.prevent
        @click="applySuggestion(suggestion)"
      >
        {{ suggestion }}
      </li>
    </ul>
  </div>
</template>
