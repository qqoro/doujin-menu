<script lang="ts" setup>
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryAndParams } from "@/composable/useQueryAndParams";
import { useTheme } from "@/composable/useTheme";
import { themeList } from "@/lib/themeList";
import { ColorTheme } from "@/types/themes";
import { Icon } from "@iconify/vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useColorMode } from "@vueuse/core";
import { AcceptableValue } from "reka-ui";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import {
  addPreset,
  deletePreset,
  getPresets,
  ipcRenderer,
  Preset,
  updatePreset,
} from "../../api";
import EtcView from "../feature/settings/EtcView.vue";
import LicenseViewDialog from "../feature/settings/LicenseViewDialog.vue"; // New import
import PresetFormDialog from "../feature/settings/PresetFormDialog.vue";
import SettingItem from "../feature/settings/SettingItem.vue";
import { Input } from "../ui/input";

const route = useRoute();
const tab = ref((route.query.tab as string) || "general");

useQueryAndParams({
  defaultOptions: {
    tab: "general",
  },
  queries: {
    tab,
  },
});

const queryClient = useQueryClient();

// 프리셋 관리 상태
const isPresetFormDialogOpen = ref(false);
const editingPreset = ref<Preset | null>(null);

const isLicenseViewDialogOpen = ref(false);

interface LibraryFolder {
  path: string;
  bookCount: number;
  lastScanned: string | null;
}

// 프리셋 불러오기
const { data: presets, isLoading: isLoadingPresets } = useQuery({
  queryKey: ["presets"],
  queryFn: getPresets,
});

// 프리셋 추가/수정 뮤테이션
const addUpdatePresetMutation = useMutation({
  mutationFn: async (preset: Omit<Preset, "id"> | Preset) => {
    if ("id" in preset && preset.id) {
      return updatePreset(preset as Preset);
    } else {
      return addPreset(preset);
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["presets"] });
    toast.success("프리셋이 성공적으로 저장되었습니다.");
    isPresetFormDialogOpen.value = false;
    editingPreset.value = null;
  },
  onError: (error) => {
    toast.error("프리셋 저장에 실패했습니다.", { description: error.message });
  },
});

// 프리셋 삭제 뮤테이션
const deletePresetMutation = useMutation({
  mutationFn: deletePreset,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["presets"] });
    toast.success("프리셋이 성공적으로 삭제되었습니다.");
  },
  onError: (error) => {
    toast.error("프리셋 삭제에 실패했습니다.", { description: error.message });
  },
});

// 프리셋 다이얼로그 열기/닫기
const openPresetDialog = (preset: Preset | null = null) => {
  editingPreset.value = preset;
  isPresetFormDialogOpen.value = true;
};

const closePresetDialog = () => {
  isPresetFormDialogOpen.value = false;
  editingPreset.value = null;
};

// 설정 상태
const theme = useColorMode();
const { setTheme } = useTheme();
const colorTheme = ref<ColorTheme>("cosmic-night");
const autoLoadLibrary = ref(true);
const libraryFolders = ref<LibraryFolder[]>([]);
const createInfoTxtFile = ref(true);
const downloadPattern = ref("%artist% - %title%");
const compressDownload = ref(false);
const compressFormat = ref<"cbz" | "zip">("cbz");
const prioritizeKoreanTitles = ref(false);
const useAppLock = ref(false);
const newPassword = ref("");
const confirmPassword = ref("");

// 임시 파일 관리 상태
const tempFilesSize = ref("0 Bytes");

// 뷰어 설정 상태
const viewerReadingDirection = ref<"ltr" | "rtl" | "webtoon">("ltr");
const viewerDoublePageView = ref(false);
const viewerShowCoverAlone = ref(true);
const viewerAutoFitZoom = ref(true);
const viewerRestoreLastSession = ref(true);
const viewerExcludeCompleted = ref(false);

// 라이브러리 폴더 정보 불러오기
const loadLibraryFolders = async () => {
  const config = await ipcRenderer.invoke("get-config");
  const folders = (config.libraryFolders || []) as string[];
  const folderPromises = folders.map(async (folder: string) => {
    const stats = await ipcRenderer.invoke("get-library-folder-stats", folder);
    return {
      path: folder,
      bookCount: stats.data?.bookCount || 0,
      lastScanned: stats.data?.lastScanned || null,
    };
  });
  libraryFolders.value = await Promise.all(folderPromises);
};

// 컴포넌트 마운트 시 설정 불러오기
onMounted(async () => {
  if (route.query.tab) {
    tab.value = route.query.tab as string;
  }

  const config = await ipcRenderer.invoke("get-config");
  theme.value = (config.theme as "light" | "dark" | "auto") || "auto";
  colorTheme.value = (config.colorTheme as ColorTheme) || "cosmic-night";
  autoLoadLibrary.value = config.autoLoadLibrary !== false;
  createInfoTxtFile.value = config.createInfoTxtFile !== false;
  downloadPattern.value =
    (config.downloadPattern as string) || "%artist% - %title%";
  compressDownload.value = config.compressDownload === true;
  compressFormat.value = (config.compressFormat as "cbz" | "zip") || "cbz";
  prioritizeKoreanTitles.value = config.prioritizeKoreanTitles === true;
  useAppLock.value = config.useAppLock === true;

  // 뷰어 설정 불러오기
  viewerReadingDirection.value =
    (config.viewerReadingDirection as "ltr" | "rtl" | "webtoon") || "ltr";
  viewerDoublePageView.value = config.viewerDoublePageView === true;
  viewerShowCoverAlone.value = config.viewerShowCoverAlone !== false;
  viewerAutoFitZoom.value = config.viewerAutoFitZoom !== false;
  viewerRestoreLastSession.value = config.viewerRestoreLastSession !== false;
  viewerExcludeCompleted.value = config.viewerExcludeCompleted === true;
  await loadLibraryFolders();
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

// 설정 저장 함수
const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", {
      description: result.error,
    });
  }
};

// 테마 변경 시 저장
const onThemeChange = (newTheme: AcceptableValue) => {
  theme.value = newTheme as "light" | "dark" | "auto";
  saveConfig("theme", newTheme);
};

// 컬러 테마 변경 시 저장
const onColorThemeChange = async (newTheme: AcceptableValue) => {
  const themeValue = newTheme as ColorTheme;
  colorTheme.value = themeValue;
  await setTheme(themeValue);
};

// 스위치 변경 시 저장
const onAutoLoadChange = (value: boolean) => {
  autoLoadLibrary.value = value;
  saveConfig("autoLoadLibrary", value);
};

const onCreateInfoTxtFileChange = (value: boolean) => {
  createInfoTxtFile.value = value;
  saveConfig("createInfoTxtFile", value);
};

const onDownloadPatternChange = (value: string) => {
  downloadPattern.value = value;
  saveConfig("downloadPattern", value);
};

const onCompressDownloadChange = (value: boolean) => {
  compressDownload.value = value;
  saveConfig("compressDownload", value);
};

const onCompressFormatChange = (value: AcceptableValue) => {
  compressFormat.value = value as "cbz" | "zip";
  saveConfig("compressFormat", value);
};

const onPrioritizeKoreanTitlesChange = (value: boolean) => {
  prioritizeKoreanTitles.value = value;
  saveConfig("prioritizeKoreanTitles", value);
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

// 라이브러리 폴더 추가
const addLibraryFolder = async () => {
  const result = await ipcRenderer.invoke("add-library-folder");
  if (result.success) {
    await loadLibraryFolders();
    if (result.added && result.added.length > 0) {
      toast.success(
        `${result.added.length}개의 라이브러리 폴더가 추가되었습니다.`,
      );
    }
    if (result.alreadyExists && result.alreadyExists.length > 0) {
      toast.info(`${result.alreadyExists.length}개의 폴더는 이미 존재합니다.`);
    }
  } else if (result.error && result.error !== "No folder selected.") {
    toast.error("폴더 추가에 실패했습니다.", { description: result.error });
  }
};

// 라이브러리 폴더 삭제
const removeLibraryFolder = async (folderPath: string) => {
  const result = await ipcRenderer.invoke("remove-library-folder", folderPath);
  if (result.success) {
    await loadLibraryFolders();
    toast.success("라이브러리 폴더가 삭제되었습니다.");
  }
};

// 라이브러리 폴더 다시 스캔
const rescanLibraryFolder = async (folderPath: string) => {
  toast.info(`'${folderPath}' 폴더를 다시 스캔합니다...`);
  const result = await ipcRenderer.invoke("rescan-library-folder", folderPath);
  if (result.success) {
    await loadLibraryFolders();
    toast.success(`'${folderPath}' 폴더 스캔이 완료되었습니다.`);
  } else {
    toast.error("폴더 스캔에 실패했습니다.", { description: result.error });
  }
};

// 전체 썸네일 재생성
const regenerateAllThumbnails = async () => {
  toast.info("전체 썸네일 재생성을 시작합니다...");
  const result = await ipcRenderer.invoke("regenerate-all-thumbnails");
  if (result.success) {
    toast.success("모든 썸네일이 성공적으로 재생성되었습니다.");
  } else {
    toast.error("썸네일 재생성에 실패했습니다.", { description: result.error });
  }
};

// 전체 메타데이터 재스캔
const rescanAllMetadata = async () => {
  toast.info("전체 메타데이터 재스캔을 시작합니다...");
  const result = await ipcRenderer.invoke("rescan-all-metadata");
  if (result.success) {
    await loadLibraryFolders(); // 스캔 후 폴더 정보 업데이트
    toast.success("모든 라이브러리 폴더의 메타데이터 스캔이 완료되었습니다.");
  } else {
    toast.error("메타데이터 재스캔에 실패했습니다.", {
      description: result.error,
    });
  }
};

// 폴더 열기
const openFolder = async (folderPath: string) => {
  const result = await ipcRenderer.invoke("open-folder", folderPath);
  if (result.success) {
    toast.success("폴더를 열었습니다.");
  } else {
    toast.error("폴더 열기에 실패했습니다.", { description: result.error });
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
  <div class="h-full flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <Icon icon="solar:settings-bold-duotone" class="w-7 h-7" />
        설정
      </h1>
    </div>

    <Tabs v-model="tab" orientation="vertical" class="flex-1">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="md:col-span-1">
          <TabsList class="w-full flex-col h-auto items-stretch">
            <TabsTrigger value="general" class="justify-start p-3">
              <Icon icon="solar:settings-linear" class="w-5 h-5" />
              일반
            </TabsTrigger>
            <TabsTrigger value="library" class="justify-start p-3">
              <Icon icon="solar:folder-with-files-linear" class="w-5 h-5" />
              라이브러리
            </TabsTrigger>
            <TabsTrigger value="viewer" class="justify-start p-3">
              <Icon icon="solar:display-linear" class="w-5 h-5" />
              뷰어
            </TabsTrigger>
            <TabsTrigger value="downloader" class="justify-start p-3">
              <Icon icon="solar:download-square-linear" class="w-5 h-5" />
              다운로더
            </TabsTrigger>
            <TabsTrigger value="presets" class="justify-start p-3">
              <Icon icon="solar:bookmark-linear" class="w-5 h-5" />
              프리셋
            </TabsTrigger>
            <TabsTrigger value="advanced" class="justify-start p-3">
              <Icon icon="solar:danger-triangle-linear" class="w-5 h-5" />
              고급
            </TabsTrigger>
            <TabsTrigger value="etc" class="justify-start p-3">
              <Icon icon="solar:menu-dots-bold-duotone" class="w-5 h-5" />
              기타
            </TabsTrigger>
          </TabsList>
        </div>

        <div class="md:col-span-3 overflow-y-auto h-full pb-6">
          <TabsContent value="general" class="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>일반 설정</CardTitle>
                <CardDescription
                  >앱의 일반적인 동작을 설정합니다.</CardDescription
                >
              </CardHeader>
              <CardContent class="space-y-6">
                <SettingItem
                  label-for="theme-select"
                  title="앱 테마"
                  subtitle="라이트/다크 모드를 선택합니다."
                >
                  <Select
                    id="theme-select"
                    :model-value="theme"
                    @update:model-value="onThemeChange"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="테마 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">라이트</SelectItem>
                      <SelectItem value="dark">다크</SelectItem>
                      <SelectItem value="auto">시스템 설정</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingItem>
                <SettingItem label-for="color-theme-select" title="컬러 테마">
                  <template #subtitle>
                    <p class="text-sm text-muted-foreground">
                      앱의 전체적인 색상 테마를 선택합니다. 변경 시 즉시
                      적용됩니다.
                    </p>
                    <p class="text-xs text-muted-foreground mt-1">
                      <a
                        href="https://tweakcn.com/#examples"
                        class="text-primary hover:underline cursor-pointer"
                        @click.prevent="
                          () =>
                            ipcRenderer.send(
                              'open-external-link',
                              'https://tweakcn.com/#examples',
                            )
                        "
                      >
                        여기에서 미리볼 수 있습니다 →
                      </a>
                    </p>
                  </template>
                  <Select
                    id="color-theme-select"
                    :model-value="colorTheme"
                    @update:model-value="onColorThemeChange"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="컬러 테마 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="theme in themeList"
                        :key="theme.value"
                        :value="theme.value"
                      >
                        {{ theme.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </SettingItem>
                <SettingItem
                  label-for="auto-load-library"
                  title="시작 시 라이브러리 자동 스캔"
                  subtitle="앱 시작 시 라이브러리 폴더를 자동으로 스캔합니다."
                >
                  <Switch
                    id="auto-load-library"
                    :model-value="autoLoadLibrary"
                    class="justify-self-end"
                    @update:model-value="onAutoLoadChange"
                  />
                </SettingItem>
              </CardContent>
            </Card>

            <Card class="mt-6">
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
                    <span class="text-sm text-muted-foreground">{{
                      tempFilesSize
                    }}</span>
                    <AlertDialog>
                      <AlertDialogTrigger as-child>
                        <Button variant="destructive">정리</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle
                            >정말로 임시 파일을
                            삭제하시겠습니까?</AlertDialogTitle
                          >
                          <AlertDialogDescription>
                            이 작업은 되돌릴 수 없습니다. 다운로더 미리보기 캐시
                            및 기타 임시 파일이 영구적으로 삭제됩니다.
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

            <Card class="mt-6">
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
                <div v-if="useAppLock" class="space-y-4 pt-4 border-t">
                  <div
                    class="p-3 rounded-md bg-destructive/10 border border-destructive/50 text-destructive-foreground"
                  >
                    <div class="flex items-start gap-2">
                      <Icon
                        icon="solar:danger-triangle-bold-duotone"
                        class="w-5 h-5 text-destructive mt-0.5 flex-shrink-0"
                      />
                      <div class="flex-1">
                        <h4 class="font-semibold">중요: 비밀번호 분실 주의</h4>
                        <p class="text-xs">
                          비밀번호를 분실할 경우, 암호화된 데이터를 복구할 수
                          있는 방법이 없습니다. 앱을 초기화해야만 다시 사용할 수
                          있으며, 이 경우 모든 라이브러리 정보와 설정이
                          삭제됩니다.
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
                    class="w-5 h-5 mr-2"
                  />
                  비밀번호 설정
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="library" class="mt-0">
            <div class="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>라이브러리 폴더</CardTitle>
                  <CardDescription
                    >만화 파일이 저장된 폴더를 관리합니다. 폴더를 추가하면
                    자동으로 스캔이 시작됩니다.</CardDescription
                  >
                </CardHeader>
                <CardContent>
                  <div class="space-y-3">
                    <div
                      v-if="libraryFolders.length === 0"
                      class="text-center text-sm text-muted-foreground p-6 rounded-md border-2 border-dashed"
                    >
                      등록된 라이브러리 폴더가 없습니다.
                    </div>
                    <div
                      v-for="folder in libraryFolders"
                      :key="folder.path"
                      class="flex items-center justify-between rounded-md border p-4"
                    >
                      <div class="truncate pr-4">
                        <p class="font-mono text-sm">{{ folder.path }}</p>
                        <p class="text-xs text-muted-foreground">
                          {{ folder.bookCount || 0 }}권 | 마지막 스캔:
                          {{
                            folder.lastScanned
                              ? new Date(folder.lastScanned).toLocaleString()
                              : "N/A"
                          }}
                        </p>
                      </div>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          @click="openFolder(folder.path)"
                        >
                          <Icon
                            icon="solar:folder-open-bold-duotone"
                            class="w-5 h-5 text-gray-500"
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          @click="rescanLibraryFolder(folder.path)"
                        >
                          <Icon
                            icon="solar:refresh-bold-duotone"
                            class="w-5 h-5 text-blue-500"
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          @click="removeLibraryFolder(folder.path)"
                        >
                          <Icon
                            icon="solar:trash-bin-trash-bold-duotone"
                            class="w-5 h-5 text-red-500"
                          />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button class="w-full" @click="addLibraryFolder">
                    <Icon
                      icon="solar:folder-add-bold-duotone"
                      class="w-5 h-5"
                    />
                    라이브러리 폴더 추가
                  </Button>
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>라이브러리 표시 설정</CardTitle>
                  <CardDescription
                    >라이브러리 화면에 표시되는 내용을
                    설정합니다.</CardDescription
                  >
                </CardHeader>
                <CardContent class="space-y-6">
                  <SettingItem
                    label-for="prioritize-korean-titles"
                    title="한국어 제목 우선 표시"
                  >
                    <template #subtitle>
                      <p class="text-sm text-muted-foreground">
                        제목에 한국어와 다른 언어가 함께 있을 경우 한국어를
                        우선적으로 표시합니다. (예: 'Original Title | 한국어
                        제목' -> '한국어 제목')
                      </p>
                      <p
                        class="text-xs text-amber-600 dark:text-amber-400 mt-1"
                      >
                        <Icon
                          icon="solar:danger-triangle-bold-duotone"
                          class="inline-block w-4 h-4"
                        />
                        이 기능은 파일명의 형식이 일관되지 않은 경우 제목이
                        예상대로 나타나지 않을 수 있습니다.
                      </p>
                    </template>
                    <Switch
                      id="prioritize-korean-titles"
                      :model-value="prioritizeKoreanTitles"
                      class="justify-self-end"
                      @update:model-value="onPrioritizeKoreanTitlesChange"
                    />
                  </SettingItem>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>라이브러리 재스캔</CardTitle>
                  <CardDescription
                    >라이브러리 전체를 대상으로 썸네일 및 메타데이터를 다시
                    스캔합니다.</CardDescription
                  >
                </CardHeader>
                <CardContent class="space-y-4">
                  <SettingItem title="전체 썸네일 재생성">
                    <Button variant="outline" @click="regenerateAllThumbnails"
                      >재생성</Button
                    >
                  </SettingItem>
                  <SettingItem title="전체 메타데이터 재스캔">
                    <Button variant="outline" @click="rescanAllMetadata"
                      >재스캔</Button
                    >
                  </SettingItem>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="viewer" class="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>뷰어 설정</CardTitle>
                <CardDescription
                  >만화책을 볼 때의 환경을 설정합니다.</CardDescription
                >
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="downloader" class="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>다운로더 설정</CardTitle>
                <CardDescription
                  >다운로드 관련 동작을 설정합니다.</CardDescription
                >
              </CardHeader>
              <CardContent class="space-y-6">
                <SettingItem
                  label-for="create-info-txt-file"
                  title="다운로드 후 info.txt 파일 생성"
                  subtitle="다운로드 완료 후 작품 정보가 담긴 info.txt 파일을 생성합니다."
                >
                  <Switch
                    id="create-info-txt-file"
                    :model-value="createInfoTxtFile"
                    class="justify-self-end"
                    @update:model-value="onCreateInfoTxtFileChange"
                  />
                </SettingItem>
                <SettingItem
                  label-for="download-pattern-input"
                  title="다운로드 폴더명 패턴"
                  subtitle="다운로드될 폴더의 이름을 지정하는 패턴입니다."
                >
                  <Input
                    id="download-pattern-input"
                    placeholder="%artist% - %title%"
                    class="col-span-1"
                    :model-value="downloadPattern"
                    @update:model-value="
                      onDownloadPatternChange($event as string)
                    "
                  />
                </SettingItem>
                <div class="col-span-3 text-sm text-muted-foreground">
                  <p class="font-semibold">사용 가능한 변수</p>
                  <ul class="list-disc list-inside ml-4">
                    <li><code>%artist%</code>: 작가명</li>
                    <li><code>%title%</code>: 작품 제목</li>
                    <li><code>%id%</code>: 갤러리 ID</li>
                    <li><code>%language%</code>: 언어</li>
                    <li><code>%groups%</code>: 그룹</li>
                  </ul>
                  <p class="mt-2">
                    예시: <code>%artist% - %title% (%id%)</code>
                  </p>
                </div>
                <SettingItem
                  label-for="compress-download"
                  title="다운로드 후 압축"
                  subtitle="다운로드 완료 후 이미지 파일을 압축합니다. 압축하면 원본 이미지 폴더는 자동으로 삭제됩니다."
                >
                  <Switch
                    id="compress-download"
                    :model-value="compressDownload"
                    class="justify-self-end"
                    @update:model-value="onCompressDownloadChange"
                  />
                </SettingItem>
                <SettingItem
                  label-for="compress-format-select"
                  title="압축 형식"
                  subtitle="압축 파일의 형식을 선택합니다. CBZ는 만화책 전용 포맷입니다."
                >
                  <Select
                    id="compress-format-select"
                    :model-value="compressFormat"
                    :disabled="!compressDownload"
                    @update:model-value="onCompressFormatChange"
                  >
                    <SelectTrigger class="w-[180px]">
                      <SelectValue placeholder="압축 형식 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cbz">CBZ (권장)</SelectItem>
                      <SelectItem value="zip">ZIP</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingItem>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" class="mt-0">
            <div class="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>데이터 유지보수</CardTitle>
                  <CardDescription
                    >데이터베이스 백업 및 복원 기능을
                    제공합니다.</CardDescription
                  >
                </CardHeader>
                <CardContent class="space-y-4">
                  <SettingItem title="데이터베이스">
                    <div class="flex gap-2">
                      <Button variant="outline" @click="backupDatabase"
                        >백업</Button
                      >
                      <Button variant="outline" @click="restoreDatabase"
                        >복원</Button
                      >
                    </div>
                  </SettingItem>
                </CardContent>
              </Card>
              <!-- New Card for Open Source Licenses -->
              <Card>
                <CardHeader>
                  <CardTitle>오픈소스 라이선스</CardTitle>
                  <CardDescription>
                    이 애플리케이션에 사용된 오픈소스 라이브러리 정보를
                    확인합니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SettingItem title="라이선스 목록">
                    <Button
                      variant="outline"
                      @click="isLicenseViewDialogOpen = true"
                    >
                      <Icon icon="solar:document-text-linear" class="w-5 h-5" />
                      라이선스 보기
                    </Button>
                  </SettingItem>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle class="text-destructive"
                    >모든 데이터 초기화</CardTitle
                  >
                  <CardDescription
                    >주의: 아래 작업은 되돌릴 수 없습니다.</CardDescription
                  >
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
                            >정말로 모든 데이터를
                            초기화하시겠습니까?</AlertDialogTitle
                          >
                          <AlertDialogDescription>
                            이 작업은 되돌릴 수 없습니다. 라이브러리, 책 정보,
                            열람 기록, 설정 등 모든 데이터가 영구적으로
                            삭제됩니다.
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
            </div>
          </TabsContent>

          <TabsContent value="presets" class="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>검색 프리셋 관리</CardTitle>
                <CardDescription
                  >자주 사용하는 검색어 조합을 저장하고
                  관리합니다.</CardDescription
                >
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="flex justify-end">
                  <Button @click="openPresetDialog()">
                    <Icon
                      icon="solar:add-circle-bold-duotone"
                      class="w-5 h-5"
                    />
                    새 프리셋 추가
                  </Button>
                </div>
                <!-- Presets Table will go here -->
                <div
                  v-if="isLoadingPresets"
                  class="text-center text-muted-foreground"
                >
                  프리셋 불러오는 중...
                </div>
                <div v-else-if="presets && presets.length > 0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>검색어</TableHead>
                        <TableHead class="w-[100px] text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="preset in presets" :key="preset.id">
                        <TableCell class="font-medium">{{
                          preset.name
                        }}</TableCell>
                        <TableCell class="text-muted-foreground">{{
                          preset.query
                        }}</TableCell>
                        <TableCell class="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            @click="openPresetDialog(preset)"
                          >
                            <Icon
                              icon="solar:pen-bold-duotone"
                              class="w-4 h-4"
                            />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger as-child>
                              <Button variant="ghost" size="icon">
                                <Icon
                                  icon="solar:trash-bin-trash-bold-duotone"
                                  class="w-4 h-4 text-red-500"
                                />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>프리셋 삭제</AlertDialogTitle>
                                <AlertDialogDescription>
                                  '{{ preset.name }}' 프리셋을 정말로
                                  삭제하시겠습니까? 이 작업은 되돌릴 수
                                  없습니다.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction
                                  @click="
                                    deletePresetMutation.mutate(preset.id)
                                  "
                                  >삭제</AlertDialogAction
                                >
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div v-else>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>검색어</TableHead>
                        <TableHead class="w-[100px] text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell
                          colspan="3"
                          class="text-center text-muted-foreground p-6"
                        >
                          (없음)
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="etc" class="mt-0">
            <EtcView />
          </TabsContent>

          <PresetFormDialog
            :open="isPresetFormDialogOpen"
            :editing-preset="editingPreset"
            @update:open="closePresetDialog"
            @save="addUpdatePresetMutation.mutate($event)"
          />

          <!-- Add LicenseViewDialog here -->
          <LicenseViewDialog
            :open="isLicenseViewDialogOpen"
            @update:open="isLicenseViewDialogOpen = $event"
          />
        </div>
      </div>
    </Tabs>
  </div>
</template>
