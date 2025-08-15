<script setup lang="ts">
import * as api from "@/api";
import { ipcRenderer } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Icon } from "@iconify/vue";
import { onMounted, ref } from "vue";

const appVersion = ref("로딩 중...");
const updateStatus = ref("idle"); // idle, checking, update-available, downloading, download-progress, update-downloaded, error, update-not-available, update-available-portable
const latestVersion = ref("");
const downloadProgress = ref(0);
const updateError = ref("");
const githubReleasesUrl = ref(""); // GitHub 릴리즈 URL 추가
const isPortableVersion = ref(false); // 포터블 버전 여부 추가

const checkForUpdates = async () => {
  updateStatus.value = "checking";
  const result = await ipcRenderer.invoke("check-for-updates");
  if (result.success) {
    isPortableVersion.value = result.portable; // 포터블 버전 여부 저장
    if (result.portable) {
      if (result.updateAvailable) {
        updateStatus.value = "update-available-portable";
        latestVersion.value = result.latestVersion;
        githubReleasesUrl.value = result.githubReleasesUrl;
      } else {
        updateStatus.value = "update-not-available";
      }
    } else {
      // 설치 버전 로직은 기존대로 update-status 이벤트를 통해 처리
      // result.result는 autoUpdater.checkForUpdates()의 결과
    }
  } else {
    updateStatus.value = "error";
    updateError.value = result.error;
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
    updateError.value = result.error;
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

onMounted(async () => {
  appVersion.value = await api.getAppVersion();

  ipcRenderer.on("update-status", (_event, data) => {
    updateStatus.value = data.status;
    if (data.status === "update-available") {
      latestVersion.value = data.info.version;
    } else if (data.status === "download-progress") {
      downloadProgress.value = Math.round(data.progressObj.percent);
    } else if (data.status === "update-downloaded") {
      latestVersion.value = data.info.version;
    } else if (data.status === "error") {
      updateError.value = data.error;
    }
    // update-available-portable 상태는 checkForUpdates에서 직접 처리하므로 여기서는 필요 없음
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
            <p class="text-sm text-muted-foreground">
              현재 애플리케이션 버전입니다.
            </p>
          </div>
          <span class="text-sm text-muted-foreground justify-self-end"
            >v{{ appVersion }}</span
          >
        </div>
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label>업데이트</Label>
            <p class="text-sm text-muted-foreground">
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
              class="w-4 h-4 mr-2"
            />
            업데이트 확인
          </Button>
        </div>
        <div>
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
            <Label for="github-repo">GitHub 저장소</Label>
            <p class="text-sm text-muted-foreground">
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

    <Card>
      <CardHeader>
        <CardTitle>개발자 도구</CardTitle>
        <CardDescription>개발 및 디버깅을 위한 도구</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="toggle-dev-tools">개발자 도구 토글</Label>
            <p class="text-sm text-muted-foreground">
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
            <p class="text-sm text-muted-foreground">
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
        <CardTitle>피드백</CardTitle>
        <CardDescription>오류 제보 및 기능 건의</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-3 items-center gap-4">
          <div class="col-span-2">
            <Label for="github-issues" class="font-medium"
              >오류 제보 및 건의</Label
            >
            <p class="text-sm text-muted-foreground">
              GitHub Issues 페이지를 통해 오류를 제보하거나 기능을 건의합니다.
            </p>
          </div>
          <Button
            id="github-issues"
            variant="outline"
            class="justify-self-end"
            @click="openGitHubIssues"
          >
            <Icon icon="solar:bug-bold-duotone" class="h-4 w-4" />
            이동
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
