<script setup lang="ts">
import { WEB_CLIENT_ID } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPairing } from "@/lib/pairing";
import { Icon } from "@iconify/vue";
import { ref, watch } from "vue";

const props = defineProps<{ initialError?: string }>();

const code = ref("");
const error = ref(props.initialError ?? "");
const submitting = ref(false);

const submit = async () => {
  if (submitting.value || !/^\d{6}$/.test(code.value)) return;
  submitting.value = true;
  error.value = "";
  const result = await requestPairing(
    window.fetch.bind(window),
    WEB_CLIENT_ID,
    code.value,
  );
  if (result.ok) {
    location.reload();
    return;
  }
  submitting.value = false;
  error.value = result.message;
  code.value = "";
};

watch(code, (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits !== value) code.value = digits;
  else if (digits.length === 6) void submit();
});
</script>

<template>
  <div
    class="bg-background text-foreground flex min-h-dvh items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
  >
    <form class="flex w-full max-w-xs flex-col gap-4" @submit.prevent="submit">
      <div class="flex flex-col items-center gap-2 text-center">
        <Icon
          icon="solar:smartphone-2-bold-duotone"
          class="text-primary size-10"
        />
        <h1 class="text-lg font-semibold">PC와 연결</h1>
        <p class="text-muted-foreground text-sm">
          PC의 동인메뉴판 → 모바일 페이지에 표시된 6자리 코드를 입력하세요.
        </p>
      </div>
      <Input
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="000000"
        aria-label="연결 코드"
        class="h-12 text-center font-mono text-2xl tracking-[0.4em]"
        :disabled="submitting"
        autofocus
      />
      <p v-if="error" class="text-destructive text-center text-sm">
        {{ error }}
      </p>
      <Button type="submit" :disabled="submitting || code.length !== 6">
        <Icon
          v-if="submitting"
          icon="solar:refresh-bold-duotone"
          class="size-4 animate-spin"
        />
        연결
      </Button>
    </form>
  </div>
</template>
