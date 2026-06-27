<script setup lang="ts">
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
import LicenseViewDialog from "@/components/feature/settings/LicenseViewDialog.vue";
import { Icon } from "@iconify/vue";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { ipcRenderer } from "@/api";
import { useQueryClient } from "@tanstack/vue-query";

const queryClient = useQueryClient();
const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", { description: result.error });
  }
  queryClient.invalidateQueries({ queryKey: ["config"] });
};

// 임시 파일 관리 상태
const tempFilesSize = ref("0 Bytes");

// 보안(앱 잠금) 상태
const useAppLock = ref(false);
const newPassword = ref("");
const confirmPassword = ref("");

// 라이선스 다이얼로그
const isLicenseViewDialogOpen = ref(false);

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  useAppLock.value = config.useAppLock === true;
  await getTempFilesSize();
});

// 임시 파일 크기 가져오기
const getTempFilesSize = async () => {
  const result = await ipcRenderer.invoke("get-temp-files-size");
  if (result.success && result.data !== undefined) {
    tempFilesSize.value = result.data;
  } else {
    toast.error("임시 파일 크기 조회에 실패했습니다.", {
      description: result.error,
    });
  }
};

// 임시 파일 삭제
const clearTempFiles = async () => {
  toast.info("임시 파일을 삭제하는 중...");
  const result = await ipcRenderer.invoke("clear-temp-files");
  if (result.success) {
    toast.success("임시 파일이 성공적으로 삭제되었습니다.");
    await getTempFilesSize(); // 크기 다시고침
  } else {
    toast.error("임시 파일 삭제에 실패했습니다.", {
      description: result.error,
    });
  }
};

const onUseAppLockChange = async (value: boolean) => {
  useAppLock.value = value;
  await saveConfig("useAppLock", value);
  if (!value) {
    newPassword.value = "";
    confirmPassword.value = "";
    await ipcRenderer.invoke("clear-lock-password");
    toast.info("앱 잠금이 비활성화되었습니다. 저장된 비밀번호가 삭제됩니다.");
  }
};

const handleSetPassword = async () => {
  if (newPassword.value !== confirmPassword.value) {
    toast.error("비밀번호가 일치하지 않습니다.");
    return;
  }

  const result = await ipcRenderer.invoke(
    "set-lock-password",
    newPassword.value,
  );
  if (result.success) {
    toast.success("비밀번호가 성공적으로 설정되었습니다.");
    newPassword.value = "";
    confirmPassword.value = "";
  } else {
    toast.error("비밀번호 설정에 실패했습니다.", { description: result.error });
  }
};

// 데이터베이스 백업
const backupDatabase = async () => {
  toast.info("데이터베이스 백업을 시작합니다...");
  const result = await ipcRenderer.invoke("backup-database");
  if (result.success) {
    toast.success(
      "데이터베이스와 설정 파일 백업이 완료되었습니다. 선택하신 폴더에 DB 파일과 config.json 파일이 함께 저장됩니다.",
    );
  } else {
    toast.error("데이터베이스 백업에 실패했습니다.", {
      description: result.error,
    });
  }
};

// 데이터베이스 복원
const restoreDatabase = async () => {
  toast.info(
    "데이터베이스와 설정 파일 복원을 시작합니다. DB 파일과 config.json 파일이 함께 있는 폴더를 선택해주세요. 앱이 재시작됩니다.",
  );
  const result = await ipcRenderer.invoke("restore-database");
  if (result.success) {
    // 앱 재시작은 메인 프로세스에서 처리하므로 여기서는 별도 로직 없음
  } else {
    toast.error("데이터베이스 복원에 실패했습니다.", {
      description: result.error,
    });
  }
};

const resetAllData = async () => {
  toast.warning("모든 데이터를 초기화합니다. 앱이 재시작됩니다.");
  const result = await ipcRenderer.invoke("reset-all-data");
  if (result.success) {
    // 앱 재시작은 메인 프로세스에서 처리하므로 여기서는 별도 로직 없음
  } else {
    toast.error("데이터 초기화에 실패했습니다.", { description: result.error });
  }
};
</script>

<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>임시 파일</CardTitle>
        <CardDescription
          >앱 사용 중 생성된 임시 파일을 관리합니다.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <SettingItem
          title="임시 파일 정리"
          subtitle="다운로더 썸네일 캐시 및 기타 임시 파일을 삭제하여 디스크 공간을 확보합니다."
        >
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-sm">{{
              tempFilesSize
            }}</span>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button variant="destructive">정리</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle
                    >정말로 임시 파일을 삭제하시겠습니까?</AlertDialogTitle
                  >
                  <AlertDialogDescription>
                    이 작업은 되돌릴 수 없습니다. 다운로더 미리보기 캐시 및 기타
                    임시 파일이 영구적으로 삭제됩니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction @click="clearTempFiles"
                    >네, 삭제합니다</AlertDialogAction
                  >
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </SettingItem>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>보안</CardTitle>
        <CardDescription
          >앱 접근을 위한 잠금 기능을 설정합니다.</CardDescription
        >
      </CardHeader>
      <CardContent class="space-y-6">
        <SettingItem
          label-for="app-lock"
          title="앱 잠금 사용"
          subtitle="앱 시작 시 비밀번호를 요구하여 접근을 제어합니다."
        >
          <Switch
            id="app-lock"
            :model-value="useAppLock"
            class="justify-self-end"
            @update:model-value="onUseAppLockChange"
          />
        </SettingItem>
        <div v-if="useAppLock" class="space-y-4 border-t pt-4">
          <div
            class="bg-destructive/10 border-destructive/50 text-destructive-foreground rounded-md border p-3"
          >
            <div class="flex items-start gap-2">
              <Icon
                icon="solar:danger-triangle-bold-duotone"
                class="text-destructive mt-0.5 h-5 w-5 flex-shrink-0"
              />
              <div class="flex-1">
                <h4 class="font-semibold">중요: 비밀번호 분실 주의</h4>
                <p class="text-xs">
                  비밀번호를 분실할 경우, 암호화된 데이터를 복구할 수 있는
                  방법이 없습니다. 앱을 초기화해야만 다시 사용할 수 있으며, 이
                  경우 모든 라이브러리 정보와 설정이 삭제됩니다.
                </p>
              </div>
            </div>
          </div>
          <SettingItem
            label-for="new-password"
            title="새 비밀번호"
            subtitle="잠금 해제에 사용할 비밀번호를 입력하세요."
          >
            <Input
              id="new-password"
              v-model="newPassword"
              type="password"
              placeholder="4자 이상"
            />
          </SettingItem>
          <SettingItem
            label-for="confirm-password"
            title="비밀번호 확인"
            subtitle="설정한 비밀번호를 다시 한번 입력하세요."
          >
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              placeholder="비밀번호 확인"
            />
          </SettingItem>
        </div>
      </CardContent>
      <CardFooter v-if="useAppLock">
        <Button @click="handleSetPassword">
          <Icon
            icon="solar:lock-keyhole-minimalistic-bold-duotone"
            class="mr-2 h-5 w-5"
          />
          비밀번호 설정
        </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>데이터 유지보수</CardTitle>
        <CardDescription
          >데이터베이스 백업 및 복원 기능을 제공합니다.</CardDescription
        >
      </CardHeader>
      <CardContent class="space-y-4">
        <SettingItem title="데이터베이스">
          <div class="flex gap-2">
            <Button variant="outline" @click="backupDatabase">백업</Button>
            <Button variant="outline" @click="restoreDatabase">복원</Button>
          </div>
        </SettingItem>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>오픈소스 라이선스</CardTitle>
        <CardDescription>
          이 애플리케이션에 사용된 오픈소스 라이브러리 정보를 확인합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingItem title="라이선스 목록">
          <Button variant="outline" @click="isLicenseViewDialogOpen = true">
            <Icon icon="solar:document-text-linear" class="h-5 w-5" />
            라이선스 보기
          </Button>
        </SettingItem>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-destructive">모든 데이터 초기화</CardTitle>
        <CardDescription>주의: 아래 작업은 되돌릴 수 없습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingItem
          title="모든 데이터 초기화"
          subtitle="라이브러리, 설정, 썸네일 등 모든 데이터를 삭제하고 앱을 초기 상태로 되돌립니다."
        >
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="destructive">초기화</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle
                  >정말로 모든 데이터를 초기화하시겠습니까?</AlertDialogTitle
                >
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. 라이브러리, 책 정보, 열람 기록,
                  설정 등 모든 데이터가 영구적으로 삭제됩니다.
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
        </SettingItem>
      </CardContent>
    </Card>

    <LicenseViewDialog
      :open="isLicenseViewDialogOpen"
      @update:open="isLicenseViewDialogOpen = $event"
    />
  </div>
</template>
