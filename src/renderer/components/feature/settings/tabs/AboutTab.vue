<script setup lang="ts">
import { IS_REMOTE } from "@/lib/runtime";
import * as api from "@/api";
import { ipcRenderer } from "@/api";
import ChangelogDialog from "@/components/common/ChangelogDialog.vue";
import FeedbackDialog from "@/components/feature/settings/FeedbackDialog.vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useExportDebugData } from "@/composables/useFeedback";
import { Icon } from "@iconify/vue";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const appVersion = ref("로딩 중...");
const updateStatus = ref("idle"); // idle, checking, update-available, downloading, download-progress, update-downloaded, error, update-not-available, update-available-portable
const latestVersion = ref("");
const downloadProgress = ref(0);
const updateError = ref("");
const githubReleasesUrl = ref(""); // GitHub 릴리즈 URL 추가
const isPortableVersion = ref(false); // 포터블 버전 여부 추가
const openChangelog = ref(false);
const feedbackOpen = ref(false);
const showExportDialog = ref(false);
const exportIncludeDb = ref(true);
const exportDebug = useExportDebugData();

const handleExport = async () => {
  try {
    const result = await exportDebug.mutateAsync(exportIncludeDb.value);
    if (result.success) {
      toast.success("디버그 데이터를 내보냈습니다.");
    } else if (!result.canceled) {
      toast.error("내보내기에 실패했습니다.", { description: result.error });
    }
  } catch (error) {
    toast.error("내보내기에 실패했습니다.", {
      description: (error as Error).message,
    });
  } finally {
    showExportDialog.value = false;
  }
};

const checkForUpdates = async () => {
  updateStatus.value = "checking";
  const result = await ipcRenderer.invoke("check-for-updates");
  if (result.success) {
    isPortableVersion.value = result.portable; // 포터블 버전 여부 저장
    if (result.portable) {
      if (result.result?.updateAvailable) {
        updateStatus.value = "update-available-portable";
        latestVersion.value = result.result.version || "";
        githubReleasesUrl.value = result.githubReleasesUrl || "";
      } else {
        updateStatus.value = "update-not-available";
      }
    } else {
      // 설치 버전 로직은 기존대로 update-status 이벤트를 통해 처리
      // result.result는 autoUpdater.checkForUpdates()의 결과
    }
  } else {
    updateStatus.value = "error";
    updateError.value = result.error || "";
  }
};

const downloadUpdate = async () => {
  // 포터블 버전에서는 이 함수가 호출되지 않도록 UI에서 처리
  if (isPortableVersion.value) {
    api.openExternalLink(githubReleasesUrl.value); // GitHub 릴리즈 페이지 열기
    return;
  }
  updateStatus.value = "downloading";
  const result = await ipcRenderer.invoke("download-update");
  if (!result.success) {
    updateStatus.value = "error";
    updateError.value = result.error || "";
  }
};

const installUpdate = async () => {
  // 포터블 버전에서는 이 함수가 호출되지 않도록 UI에서 처리
  if (isPortableVersion.value) {
    api.openExternalLink(githubReleasesUrl.value); // GitHub 릴리즈 페이지 열기
    return;
  }
  await ipcRenderer.invoke("install-update");
};

const openGitHub = () => {
  api.openExternalLink("https://github.com/qqoro/doujin-menu");
};

const openGitHubIssues = () => {
  api.openExternalLink("https://github.com/qqoro/doujin-menu/issues");
};

const toggleDevTools = () => {
  api.toggleDevTools();
};

const openLogFolder = () => {
  api.openLogFolder();
};

const showChangelog = () => {
  openChangelog.value = true;
};

onMounted(async () => {
  appVersion.value = await api.getAppVersion();

  ipcRenderer.on("update-status", (_event, data) => {
    updateStatus.value = data.status;
    if (data.status === "update-available" && data.info) {
      latestVersion.value = data.info.version;
    } else if (data.status === "download-progress" && data.progressObj) {
      downloadProgress.value = Math.round(data.progressObj.percent);
    } else if (data.status === "update-downloaded" && data.info) {
      latestVersion.value = data.info.version;
    } else if (data.status === "error" && data.error) {
      updateError.value = data.error;
    }
  });
});
</script>

<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>앱 정보</CardTitle>
        <CardDescription>애플리케이션 버전 및 관련 링크</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label>버전</Label>
            <p class="text-muted-foreground text-sm">
              현재 애플리케이션 버전입니다.
            </p>
          </div>
          <span class="text-muted-foreground justify-self-end text-sm"
            >v{{ appVersion }}</span
          >
        </div>
        <!-- 업데이트는 PC 앱을 내려받아 다시 설치하므로 휴대폰에서는 감춘다 -->
        <div v-if="!IS_REMOTE" class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label>업데이트</Label>
            <p class="text-muted-foreground text-sm">
              앱 업데이트를 확인하고 설치합니다.
            </p>
          </div>
          <Button
            class="justify-self-end"
            variant="outline"
            :disabled="
              updateStatus === 'checking' || updateStatus === 'downloading'
            "
            @click="checkForUpdates"
          >
            <Icon
              v-if="updateStatus === 'checking'"
              icon="svg-spinners:ring-resize"
              class="h-4 w-4"
            />
            업데이트 확인
          </Button>
        </div>
        <div v-if="!IS_REMOTE">
          <!-- 설치 버전: 업데이트 가능 -->
          <div
            v-if="updateStatus === 'update-available' && !isPortableVersion"
            class="flex items-center justify-between text-green-600"
          >
            <p class="text-sm font-medium">
              새로운 업데이트 사용 가능: {{ latestVersion }}
            </p>
            <Button variant="outline" @click="downloadUpdate">
              업데이트 다운로드
            </Button>
          </div>

          <!-- 포터블 버전: 업데이트 가능 -->
          <div
            v-if="
              updateStatus === 'update-available-portable' && isPortableVersion
            "
            class="flex items-center justify-between text-green-600"
          >
            <p class="text-sm font-medium">
              새로운 업데이트 사용 가능: {{ latestVersion }}
            </p>
            <Button
              variant="outline"
              @click="api.openExternalLink(githubReleasesUrl)"
            >
              GitHub에서 수동 다운로드
            </Button>
          </div>

          <!-- 다운로드 중 -->
          <div
            v-if="updateStatus === 'download-progress'"
            class="flex items-center justify-between"
          >
            <p class="text-sm font-medium">
              다운로드 중: {{ downloadProgress }}%
            </p>
            <Progress :model-value="downloadProgress" class="w-[60%]" />
          </div>

          <!-- 업데이트 다운로드 완료 (설치 버전만 해당) -->
          <div
            v-if="updateStatus === 'update-downloaded' && !isPortableVersion"
            class="flex items-center justify-between text-green-600"
          >
            <p class="text-sm font-medium">업데이트 준비 완료!</p>
            <Button @click="installUpdate"> 앱 재시작 및 설치 </Button>
          </div>

          <!-- 오류 발생 -->
          <div v-if="updateStatus === 'error'" class="text-red-500">
            <p class="text-sm font-medium">업데이트 오류: {{ updateError }}</p>
          </div>

          <!-- 최신 버전 -->
          <div
            v-if="updateStatus === 'update-not-available'"
            class="text-muted-foreground"
          >
            <p class="text-sm font-medium">최신 버전입니다.</p>
          </div>
        </div>
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="changelog">업데이트 내역</Label>
            <p class="text-muted-foreground text-sm">
              최신 버전의 변경 내역을 확인합니다.
            </p>
          </div>
          <Button
            id="changelog"
            variant="outline"
            class="justify-self-end"
            @click="showChangelog"
          >
            <Icon icon="solar:document-text-bold-duotone" class="h-4 w-4" />
            내역 보기
          </Button>
        </div>
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="github-repo">GitHub 저장소</Label>
            <p class="text-muted-foreground text-sm">
              프로젝트의 소스 코드를 확인합니다.
            </p>
          </div>
          <Button
            id="github-repo"
            variant="outline"
            class="justify-self-end"
            @click="openGitHub"
          >
            <Icon icon="mdi:github" class="h-4 w-4" />
            열기
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="!IS_REMOTE">
      <CardHeader>
        <CardTitle>개발자 도구</CardTitle>
        <CardDescription>개발 및 디버깅을 위한 도구</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="toggle-dev-tools">개발자 도구 토글</Label>
            <p class="text-muted-foreground text-sm">
              개발자 도구 창을 열거나 닫습니다.
            </p>
          </div>
          <Button
            id="toggle-dev-tools"
            variant="outline"
            class="justify-self-end"
            @click="toggleDevTools"
          >
            <Icon icon="solar:code-bold-duotone" class="h-4 w-4" />
            토글
          </Button>
        </div>
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="open-log-folder">로그 폴더 열기</Label>
            <p class="text-muted-foreground text-sm">
              애플리케이션 로그 파일이 저장된 폴더를 엽니다.
            </p>
          </div>
          <Button
            id="open-log-folder"
            variant="outline"
            class="justify-self-end"
            @click="openLogFolder"
          >
            <Icon icon="solar:folder-with-files-bold-duotone" class="h-4 w-4" />
            열기
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>버그 제보 · 건의</CardTitle>
        <CardDescription class="break-keep">
          {{
            IS_REMOTE
              ? "GitHub 이슈로 등록할 수 있습니다."
              : "GitHub 이슈로 등록하거나, GitHub 계정 없이 앱에서 바로 보낼 수 있습니다."
          }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="github-issues" class="font-medium">GitHub 이슈</Label>
            <p class="text-muted-foreground text-sm">
              GitHub Issues 페이지로 이동합니다.
            </p>
          </div>
          <Button
            id="github-issues"
            class="justify-self-end"
            @click="openGitHubIssues"
          >
            <Icon icon="solar:bug-bold-duotone" class="h-4 w-4" />
            이동
          </Button>
        </div>
        <template v-if="!IS_REMOTE">
          <div class="grid grid-cols-3 items-center gap-4">
            <div class="col-span-2">
              <Label for="export-debug-data" class="font-medium"
                >디버그 데이터</Label
              >
              <p class="text-muted-foreground text-sm">
                시스템 정보, 설정, 로그를 파일로 저장합니다.
              </p>
            </div>
            <Button
              id="export-debug-data"
              variant="outline"
              class="justify-self-end"
              :disabled="exportDebug.isPending.value"
              @click="showExportDialog = true"
            >
              <Icon
                :icon="
                  exportDebug.isPending.value
                    ? 'svg-spinners:ring-resize'
                    : 'solar:download-minimalistic-bold-duotone'
                "
                class="h-4 w-4"
              />
              내보내기
            </Button>
          </div>
          <div class="grid grid-cols-3 items-center gap-4">
            <div class="col-span-2">
              <Label for="send-feedback" class="font-medium"
                >앱에서 바로 보내기</Label
              >
              <p class="text-muted-foreground text-sm">
                디버그 데이터를 함께 보낼 수 있습니다.
              </p>
            </div>
            <Button
              id="send-feedback"
              variant="outline"
              class="justify-self-end"
              @click="feedbackOpen = true"
            >
              <Icon icon="solar:chat-round-line-bold-duotone" class="h-4 w-4" />
              보내기
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>
    <ChangelogDialog v-model:open="openChangelog" />
    <FeedbackDialog v-model:open="feedbackOpen" />

    <Dialog v-model:open="showExportDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>디버그 데이터 내보내기</DialogTitle>
          <DialogDescription>
            시스템 정보, 설정, 로그가 들어간 파일을 만듭니다.
          </DialogDescription>
        </DialogHeader>
        <Label class="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox v-model="exportIncludeDb" />
          데이터베이스 포함
        </Label>
        <DialogFooter>
          <Button variant="outline" @click="showExportDialog = false"
            >취소</Button
          >
          <Button :disabled="exportDebug.isPending.value" @click="handleExport"
            >내보내기</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
