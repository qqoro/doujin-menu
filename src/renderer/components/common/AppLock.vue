<script setup lang="ts">
import { ipcRenderer } from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { ref } from "vue";
import { toast } from "vue-sonner";

const uiStore = useUiStore();
const password = ref("");
const isVerifying = ref(false);

const handleUnlock = async () => {
  if (!password.value) {
    toast.error("비밀번호를 입력해주세요.");
    return;
  }
  isVerifying.value = true;
  const result = await ipcRenderer.invoke(
    "verify-lock-password",
    password.value,
  );
  isVerifying.value = false;

  if (result.success) {
    uiStore.setLocked(false);
  } else {
    toast.error("비밀번호가 올바르지 않습니다.");
    password.value = "";
  }
};

const resetAllData = async () => {
  toast.warning("모든 데이터를 초기화합니다. 앱이 재시작됩니다.");
  const result = await ipcRenderer.invoke("reset-all-data");
  if (!result.success) {
    toast.error("데이터 초기화에 실패했습니다.", { description: result.error });
  }
};
</script>

<template>
  <div
    v-if="uiStore.isLocked"
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
  >
    <div
      class="flex w-full max-w-xs flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
    >
      <div class="text-center">
        <Icon
          icon="solar:lock-keyhole-minimalistic-bold-duotone"
          class="mx-auto h-12 w-12 text-primary"
        />
        <h2 class="mt-2 text-xl font-bold">앱 잠금</h2>
        <p class="text-sm text-muted-foreground">
          비밀번호를 입력하여 잠금을 해제하세요.
        </p>
      </div>
      <form class="flex flex-col gap-4" @submit.prevent="handleUnlock">
        <Input
          v-model="password"
          type="password"
          placeholder="비밀번호"
          required
          autofocus
        />
        <Button type="submit" :disabled="isVerifying">
          <Icon
            v-if="isVerifying"
            icon="svg-spinners:ring-resize"
            class="mr-2 h-4 w-4"
          />
          잠금 해제
        </Button>
      </form>

      <div class="mt-4 text-center">
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button variant="link" size="sm" class="text-destructive">
              비밀번호를 잊으셨나요? (데이터 초기화)
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle
                >정말로 모든 데이터를 초기화하시겠습니까?</AlertDialogTitle
              >
              <AlertDialogDescription>
                이 작업은 되돌릴 수 없습니다. 라이브러리, 책 정보, 열람 기록,
                설정 등 모든 데이터가 영구적으로 삭제됩니다. 이 작업은
                비밀번호를 잊어버렸을 때만 사용하세요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction @click="resetAllData"
                >네, 모든 데이터를 초기화합니다</AlertDialogAction
              >
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  </div>
</template>
