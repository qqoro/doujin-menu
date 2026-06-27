<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
import { AcceptableValue } from "reka-ui";
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

// 뷰어 설정 상태
const viewerReadingDirection = ref<"ltr" | "rtl" | "webtoon">("ltr");
const viewerDoublePageView = ref(false);
const viewerShowCoverAlone = ref(true);
const viewerAutoFitZoom = ref(true);
const viewerRestoreLastSession = ref(true);
const viewerExcludeCompleted = ref(false);
const viewerHideNavigationOverlay = ref(false);
const viewerHidePageNumber = ref(false);
const viewerHideToast = ref(false);
const viewerOpenInFullscreen = ref(false);
const externalImageViewerPath = ref("");
const externalArchiveViewerPath = ref("");

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  // 뷰어 설정 불러오기
  viewerReadingDirection.value =
    (config.viewerReadingDirection as "ltr" | "rtl" | "webtoon") || "ltr";
  viewerDoublePageView.value = config.viewerDoublePageView === true;
  viewerShowCoverAlone.value = config.viewerShowCoverAlone !== false;
  viewerAutoFitZoom.value = config.viewerAutoFitZoom !== false;
  viewerRestoreLastSession.value = config.viewerRestoreLastSession !== false;
  viewerExcludeCompleted.value = config.viewerExcludeCompleted === true;
  viewerHideNavigationOverlay.value =
    config.viewerHideNavigationOverlay === true;
  viewerHidePageNumber.value = config.viewerHidePageNumber === true;
  viewerHideToast.value = config.viewerHideToast === true;
  viewerOpenInFullscreen.value = config.viewerOpenInFullscreen === true;

  // 외부 뷰어 설정 불러오기
  externalImageViewerPath.value =
    (config.externalImageViewerPath as string) || "";
  externalArchiveViewerPath.value =
    (config.externalArchiveViewerPath as string) || "";
});

// 뷰어 설정 변경 시 저장
const onViewerReadingDirectionChange = (value: AcceptableValue) => {
  viewerReadingDirection.value = value as "ltr" | "rtl" | "webtoon";
  saveConfig("viewerReadingDirection", value);
};

const onViewerDoublePageViewChange = (value: boolean) => {
  viewerDoublePageView.value = value;
  saveConfig("viewerDoublePageView", value);
};

const onViewerShowCoverAloneChange = (value: boolean) => {
  viewerShowCoverAlone.value = value;
  saveConfig("viewerShowCoverAlone", value);
};

const onViewerAutoFitZoomChange = (value: boolean) => {
  viewerAutoFitZoom.value = value;
  saveConfig("viewerAutoFitZoom", value);
};

const onViewerRestoreLastSessionChange = (value: boolean) => {
  viewerRestoreLastSession.value = value;
  saveConfig("viewerRestoreLastSession", value);
};

const onViewerExcludeCompletedChange = (value: boolean) => {
  viewerExcludeCompleted.value = value;
  saveConfig("viewerExcludeCompleted", value);
};

const onViewerHideNavigationOverlayChange = (value: boolean) => {
  viewerHideNavigationOverlay.value = value;
  saveConfig("viewerHideNavigationOverlay", value);
};

const onViewerHidePageNumberChange = (value: boolean) => {
  viewerHidePageNumber.value = value;
  saveConfig("viewerHidePageNumber", value);
};

const onViewerHideToastChange = (value: boolean) => {
  viewerHideToast.value = value;
  saveConfig("viewerHideToast", value);
};

const onViewerOpenInFullscreenChange = (value: boolean) => {
  viewerOpenInFullscreen.value = value;
  saveConfig("viewerOpenInFullscreen", value);
};

// 이미지 뷰어 선택
const onSelectExternalImageViewer = async () => {
  const result = await ipcRenderer.invoke("select-external-image-viewer");
  if (result.success && result.data) {
    externalImageViewerPath.value = result.data;
    queryClient.invalidateQueries({ queryKey: ["config"] });
    toast.success("이미지 뷰어가 설정되었습니다.");
  }
};

// 이미지 뷰어 초기화
const onClearExternalImageViewer = async () => {
  externalImageViewerPath.value = "";
  await saveConfig("externalImageViewerPath", "");
  toast.success("이미지 뷰어 설정이 초기화되었습니다.");
};

// 압축파일 뷰어 선택
const onSelectExternalArchiveViewer = async () => {
  const result = await ipcRenderer.invoke("select-external-archive-viewer");
  if (result.success && result.data) {
    externalArchiveViewerPath.value = result.data;
    queryClient.invalidateQueries({ queryKey: ["config"] });
    toast.success("압축파일 뷰어가 설정되었습니다.");
  }
};

// 압축파일 뷰어 초기화
const onClearExternalArchiveViewer = async () => {
  externalArchiveViewerPath.value = "";
  await saveConfig("externalArchiveViewerPath", "");
  toast.success("압축파일 뷰어 설정이 초기화되었습니다.");
};
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>뷰어 설정</CardTitle>
      <CardDescription>만화책을 볼 때의 환경을 설정합니다.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <SettingItem
        label-for="reading-direction"
        title="읽기 방향"
        subtitle="만화책 페이지의 읽기 방향을 설정합니다."
      >
        <Select
          id="reading-direction"
          :model-value="viewerReadingDirection"
          @update:model-value="onViewerReadingDirectionChange"
        >
          <SelectTrigger>
            <SelectValue placeholder="읽기 방향 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ltr">왼쪽에서 오른쪽 (L→R)</SelectItem>
            <SelectItem value="rtl">오른쪽에서 왼쪽 (R→L)</SelectItem>
            <SelectItem value="webtoon">웹툰 스크롤</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>

      <SettingItem
        label-for="double-page-view"
        title="더블 페이지 뷰"
        subtitle="두 페이지를 동시에 표시할지 설정합니다."
      >
        <Switch
          id="double-page-view"
          :model-value="viewerDoublePageView"
          class="justify-self-end"
          @update:model-value="onViewerDoublePageViewChange"
        />
      </SettingItem>

      <SettingItem
        label-for="show-cover-alone"
        title="표지 따로 보기"
        subtitle="더블 페이지 모드에서 표지를 단독으로 표시합니다."
      >
        <Switch
          id="show-cover-alone"
          :model-value="viewerShowCoverAlone"
          class="justify-self-end"
          :disabled="!viewerDoublePageView"
          @update:model-value="onViewerShowCoverAloneChange"
        />
      </SettingItem>

      <SettingItem
        label-for="auto-fit-zoom"
        title="자동 맞춤 확대"
        subtitle="페이지를 화면에 자동으로 맞게 확대합니다."
      >
        <Switch
          id="auto-fit-zoom"
          :model-value="viewerAutoFitZoom"
          class="justify-self-end"
          @update:model-value="onViewerAutoFitZoomChange"
        />
      </SettingItem>

      <SettingItem
        label-for="restore-last-session"
        title="마지막 열람 위치 자동 복원"
        subtitle="만화책을 다시 열 때 마지막으로 보던 페이지를 자동으로 엽니다."
      >
        <Switch
          id="restore-last-session"
          :model-value="viewerRestoreLastSession"
          class="justify-self-end"
          @update:model-value="onViewerRestoreLastSessionChange"
        />
      </SettingItem>
      <SettingItem
        label-for="exclude-completed"
        title="완독한 책 제외하고 넘기기"
        subtitle="뷰어에서 다음/랜덤 책으로 이동 시, 완독한 책은 건너뜁니다."
      >
        <Switch
          id="exclude-completed"
          :model-value="viewerExcludeCompleted"
          class="justify-self-end"
          @update:model-value="onViewerExcludeCompletedChange"
        />
      </SettingItem>
      <SettingItem
        label-for="hide-navigation-overlay"
        title="네비게이션 오버레이 숨기기"
        subtitle="마우스를 화면 가장자리에 올렸을 때 나타나는 화살표와 그라데이션을 숨깁니다. (클릭 영역은 유지)"
      >
        <Switch
          id="hide-navigation-overlay"
          :model-value="viewerHideNavigationOverlay"
          class="justify-self-end"
          @update:model-value="onViewerHideNavigationOverlayChange"
        />
      </SettingItem>
      <SettingItem
        label-for="hide-page-number"
        title="페이지 번호 숨기기"
        subtitle="뷰어 좌측 상단에 표시되는 페이지 번호를 숨깁니다."
      >
        <Switch
          id="hide-page-number"
          :model-value="viewerHidePageNumber"
          class="justify-self-end"
          @update:model-value="onViewerHidePageNumberChange"
        />
      </SettingItem>
      <SettingItem
        label-for="hide-toast"
        title="토스트 숨기기"
        subtitle="뷰어 내 알림 토스트를 숨깁니다."
      >
        <Switch
          id="hide-toast"
          :model-value="viewerHideToast"
          class="justify-self-end"
          @update:model-value="onViewerHideToastChange"
        />
      </SettingItem>
      <SettingItem
        label-for="open-in-fullscreen"
        title="뷰어 진입 시 전체 화면"
        subtitle="만화책을 열 때 자동으로 전체 화면 모드로 진입합니다. (F11 또는 휠 클릭으로 전환 가능)"
      >
        <Switch
          id="open-in-fullscreen"
          :model-value="viewerOpenInFullscreen"
          class="justify-self-end"
          @update:model-value="onViewerOpenInFullscreenChange"
        />
      </SettingItem>
      <SettingItem
        label-for="external-image-viewer"
        title="이미지 뷰어"
        subtitle="뷰어에서 현재 페이지를 외부 프로그램으로 열거나, 폴더 형식 책을 외부로 열 때 사용합니다."
      >
        <div class="flex items-center gap-2 justify-self-end">
          <span
            v-if="externalImageViewerPath"
            class="text-muted-foreground max-w-48 truncate text-xs"
            :title="externalImageViewerPath"
          >
            {{ externalImageViewerPath.split("\\").pop()?.split("/").pop() }}
          </span>
          <span v-else class="text-muted-foreground text-xs"> 미설정 </span>
          <Button
            size="sm"
            variant="outline"
            @click="onSelectExternalImageViewer"
          >
            선택
          </Button>
          <Button
            v-if="externalImageViewerPath"
            size="sm"
            variant="ghost"
            @click="onClearExternalImageViewer"
          >
            초기화
          </Button>
        </div>
      </SettingItem>
      <SettingItem
        label-for="external-archive-viewer"
        title="압축파일 뷰어"
        subtitle="ZIP/CBZ 형식의 책을 외부 프로그램으로 열 때 사용합니다."
      >
        <div class="flex items-center gap-2 justify-self-end">
          <span
            v-if="externalArchiveViewerPath"
            class="text-muted-foreground max-w-48 truncate text-xs"
            :title="externalArchiveViewerPath"
          >
            {{ externalArchiveViewerPath.split("\\").pop()?.split("/").pop() }}
          </span>
          <span v-else class="text-muted-foreground text-xs"> 미설정 </span>
          <Button
            size="sm"
            variant="outline"
            @click="onSelectExternalArchiveViewer"
          >
            선택
          </Button>
          <Button
            v-if="externalArchiveViewerPath"
            size="sm"
            variant="ghost"
            @click="onClearExternalArchiveViewer"
          >
            초기화
          </Button>
        </div>
      </SettingItem>
    </CardContent>
  </Card>
</template>
