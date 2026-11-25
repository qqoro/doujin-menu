<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitFeedback } from "@/composables/useFeedback";
import { Icon } from "@iconify/vue";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";

const MAX_CONTENT = 3000;
const MIN_CONTENT = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const open = defineModel<boolean>("open", { required: true });

const kind = ref<"bug" | "idea">("bug");
const content = ref("");
const email = ref("");
const attachDebug = ref(true);
const includeDb = ref(true);
const errorMessage = ref("");

const submit = useSubmitFeedback();

const emailInvalid = computed(() => {
  const v = email.value.trim();
  return v !== "" && !EMAIL.test(v);
});
const canSubmit = computed(
  () =>
    content.value.trim().length >= MIN_CONTENT &&
    !emailInvalid.value &&
    !submit.isPending.value,
);
const placeholder = computed(() =>
  kind.value === "bug"
    ? "언제, 무엇을 했을 때 문제가 생겼는지 적어주세요."
    : "원하는 기능이나 바뀌었으면 하는 점을 적어주세요.",
);

// 버그면 첨부를 켜고, 건의면 끈다
watch(kind, (k) => {
  attachDebug.value = k === "bug";
});
watch(attachDebug, (on) => {
  includeDb.value = on;
});

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function reset() {
  kind.value = "bug";
  content.value = "";
  email.value = "";
  attachDebug.value = true;
  includeDb.value = true;
  errorMessage.value = "";
}

async function handleSubmit() {
  errorMessage.value = "";
  try {
    const result = await submit.mutateAsync({
      kind: kind.value,
      content: content.value,
      email: email.value,
      attachDebug: attachDebug.value,
      includeDb: attachDebug.value && includeDb.value,
    });
    if (result.ok) {
      toast.success("전송했습니다.");
      open.value = false;
      reset();
      return;
    }
    if (result.reason === "too-large") {
      errorMessage.value = result.size
        ? `디버그 데이터가 너무 큽니다 (${formatMb(result.size)}). 데이터베이스 포함을 끄고 다시 시도해 주세요.`
        : "디버그 데이터가 너무 큽니다. 데이터베이스 포함을 끄고 다시 시도해 주세요.";
    } else if (result.reason === "rate-limited") {
      errorMessage.value = "잠시 후 다시 시도해 주세요.";
    } else {
      errorMessage.value = "전송에 실패했습니다. 다시 시도해 주세요.";
    }
  } catch {
    errorMessage.value = "전송에 실패했습니다. 다시 시도해 주세요.";
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>버그 제보 · 건의</DialogTitle>
        <DialogDescription class="sr-only">
          버그 제보나 건의를 보냅니다.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-2 gap-2">
          <Button
            :variant="kind === 'bug' ? 'default' : 'outline'"
            @click="kind = 'bug'"
            >버그</Button
          >
          <Button
            :variant="kind === 'idea' ? 'default' : 'outline'"
            @click="kind = 'idea'"
            >건의</Button
          >
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="feedback-content" class="text-sm font-medium">내용</label>
          <Textarea
            id="feedback-content"
            v-model="content"
            :maxlength="MAX_CONTENT"
            :placeholder="placeholder"
            class="min-h-36 resize-y"
          />
          <span class="text-muted-foreground self-end text-xs">
            {{ content.length.toLocaleString() }} /
            {{ MAX_CONTENT.toLocaleString() }}
          </span>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="feedback-email" class="text-sm font-medium">
            이메일
            <span class="text-muted-foreground font-normal">(선택)</span>
          </label>
          <Input
            id="feedback-email"
            v-model="email"
            type="email"
            placeholder="답변을 받으려면 입력하세요"
          />
          <span v-if="emailInvalid" class="text-destructive text-xs">
            이메일 형식이 올바르지 않습니다.
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-start gap-2">
            <Checkbox
              id="feedback-attach"
              v-model="attachDebug"
              class="mt-0.5"
            />
            <label
              for="feedback-attach"
              class="flex cursor-pointer flex-col gap-0.5"
            >
              <span class="text-sm">디버그 데이터 첨부</span>
              <span v-if="kind === 'bug'" class="text-muted-foreground text-xs">
                버그라면 꼭 첨부해 주세요.
              </span>
            </label>
          </div>
          <div class="flex items-center gap-2 pl-6">
            <Checkbox
              id="feedback-include-db"
              v-model="includeDb"
              :disabled="!attachDebug"
            />
            <label
              for="feedback-include-db"
              class="cursor-pointer text-sm"
              :class="{ 'text-muted-foreground': !attachDebug }"
              >데이터베이스 포함</label
            >
          </div>
        </div>

        <p v-if="errorMessage" class="text-destructive text-sm">
          {{ errorMessage }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">취소</Button>
        <Button :disabled="!canSubmit" @click="handleSubmit">
          <Icon
            v-if="submit.isPending.value"
            icon="svg-spinners:ring-resize"
            class="h-4 w-4"
          />
          보내기
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
