<script setup lang="ts">
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BLACKLIST_TYPES, parseBlacklistInput } from "@/lib/blacklistTag";
import { Icon } from "@iconify/vue";
import { ref, watch } from "vue";

const props = defineProps<{
  /** 현재 차단 태그 목록 ("type:name" 형식) */
  modelValue: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [tags: string[]];
}>();

const isOpen = ref(false);
const input = ref("");
const error = ref("");

// 팝오버를 닫으면 입력 중이던 값과 에러를 지웁니다
watch(isOpen, (open) => {
  if (!open) {
    input.value = "";
    error.value = "";
  }
});

/**
 * 검색창의 자동완성 후보 중 차단 태그로 쓸 수 있는 것만 남깁니다.
 *
 * 검색창은 `id:`나 한글 작가명도 제안하는데 그건 차단 목록에 넣을 수 없습니다.
 * 고를 수 없는 걸 띄워두고 고르면 에러를 내느니 아예 안 보이는 편이 낫습니다.
 * 이미 차단 중인 항목도 같은 이유로 뺍니다.
 */
const suggestionFilter = (suggestion: string) => {
  // "female:"처럼 타입만 채우는 후보는 이름을 이어 칠 수 있게 남깁니다
  if (suggestion.endsWith(":")) {
    return (BLACKLIST_TYPES as readonly string[]).includes(
      suggestion.slice(0, -1),
    );
  }

  const result = parseBlacklistInput(suggestion);
  return result.ok && !props.modelValue.includes(result.entry);
};

const addTag = () => {
  const result = parseBlacklistInput(input.value);

  if (!result.ok) {
    error.value = result.error;
    return;
  }
  if (props.modelValue.includes(result.entry)) {
    error.value = "이미 차단 중인 태그입니다.";
    return;
  }

  error.value = "";
  input.value = "";
  emit("update:modelValue", [...props.modelValue, result.entry]);
};

/**
 * Enter는 자동완성이 먼저 가로채 첫 후보를 채웁니다. 그 후보가 타입만 채운
 * 상태("female:")면 아직 항목이 아니라서, 에러를 내는 대신 이름을 더 받습니다.
 */
const handleEnter = () => {
  if (input.value.trim().endsWith(":")) return;
  addTag();
};

const removeTag = (entry: string) => {
  error.value = "";
  emit(
    "update:modelValue",
    props.modelValue.filter((tag) => tag !== entry),
  );
};
</script>

<template>
  <Popover :open="isOpen" @update:open="isOpen = $event">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-xs leading-none"
        :title="
          modelValue.length > 0
            ? modelValue.join(', ')
            : '검색 결과에서 제외할 태그를 등록합니다'
        "
      >
        <Icon icon="solar:forbidden-circle-bold-duotone" class="h-3.5 w-3.5" />
        <template v-if="modelValue.length > 0">
          차단 태그 {{ modelValue.length }}개 적용 중
        </template>
        <template v-else> 차단 태그 </template>
      </button>
    </PopoverTrigger>

    <!-- PopoverContent 자체가 flex-col + gap이라 여기서 간격을 또 주지 않습니다 -->
    <PopoverContent class="w-80" align="start">
      <div>
        <p class="text-sm font-semibold">차단 태그</p>
        <p class="text-muted-foreground text-xs">
          등록한 태그가 붙은 작품은 검색 결과에서 빠집니다. 갤러리 ID로 직접
          검색(<code>id:12345</code>)할 때는 적용되지 않습니다.
        </p>
      </div>

      <div class="flex gap-2">
        <SmartSearchInput
          v-model="input"
          class="flex-1"
          placeholder="예: female:guro 또는 yaoi"
          :show-actions="false"
          :suggestion-filter="suggestionFilter"
          @keyup.enter="handleEnter"
        />
        <Button size="sm" variant="secondary" class="h-8" @click="addTag">
          추가
        </Button>
      </div>

      <p v-if="error" class="text-destructive text-xs">{{ error }}</p>

      <div v-if="modelValue.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="entry in modelValue"
          :key="entry"
          class="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
        >
          {{ entry }}
          <button
            type="button"
            class="hover:bg-background rounded-full p-0.5"
            :aria-label="`${entry} 차단 해제`"
            @click="removeTag(entry)"
          >
            <Icon icon="solar:close-circle-bold-duotone" class="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      <p v-else class="text-muted-foreground text-xs">
        아직 차단한 태그가 없습니다.
      </p>
    </PopoverContent>
  </Popover>
</template>
