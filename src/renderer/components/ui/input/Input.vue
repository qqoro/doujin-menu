<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { ref } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})

// 부모에서 input 엘리먼트를 직접 제어하기 위한 명령형 메서드 노출
const inputRef = ref<HTMLInputElement>()
defineExpose({
  focus() {
    inputRef.value?.focus()
  },
  scrollTo(...args: Parameters<HTMLInputElement["scrollTo"]>) {
    inputRef.value?.scrollTo(...args)
  },
  setSelectionRange(...args: Parameters<HTMLInputElement["setSelectionRange"]>) {
    inputRef.value?.setSelectionRange(...args)
  },
  // 커서를 입력값 끝으로 이동 (검색창에서 사용)
  goEnd() {
    if (!inputRef.value) {
      return
    }

    inputRef.value.scrollLeft = inputRef.value.scrollWidth
  },
})
</script>

<template>
  <input
    ref="inputRef"
    v-model="modelValue"
    data-slot="input"
    :class="cn(
      'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-3 aria-invalid:ring-3 md:text-sm w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
  >
</template>
