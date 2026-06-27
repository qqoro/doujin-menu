<script setup lang="ts">
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import LibraryScanProgress from "@/components/feature/LibraryScanProgress.vue";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
import { Icon } from "@iconify/vue";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { ipcRenderer } from "@/api";
import { useQueryClient } from "@tanstack/vue-query";

interface LibraryFolder {
  path: string;
  bookCount: number;
  lastScanned: string | null;
}

const queryClient = useQueryClient();
const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", { description: result.error });
  }
  queryClient.invalidateQueries({ queryKey: ["config"] });
};

const libraryFolders = ref<LibraryFolder[]>([]);
const prioritizeKoreanTitles = ref(false);
const hideLibraryTags = ref(false);

// info.txt 생성 상태
const isGeneratingInfoFiles = ref(false);
const generationProgress = ref({
  current: 0,
  total: 0,
  message: "",
});
const infoFilePattern = ref("\\((\\d+)\\)$");

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  prioritizeKoreanTitles.value = config.prioritizeKoreanTitles === true;
  hideLibraryTags.value = config.hideLibraryTags === true;
  await loadLibraryFolders();

  ipcRenderer.on("info-generation-progress", (_event, ...args) => {
    const progress = args[0] as {
      current: number;
      total: number;
      message: string;
    };
    generationProgress.value = progress;
    if (progress.current >= progress.total) {
      isGeneratingInfoFiles.value = false;
    }
  });
});

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
  if (result.success && result.offline) {
    toast.warning("폴더에 접근할 수 없습니다.", {
      description: `해당 폴더에 접근할 수 없어 ${result.offlineCount}권을 오프라인으로 표시했습니다.`,
    });
  } else if (result.success) {
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

const onPrioritizeKoreanTitlesChange = (value: boolean) => {
  prioritizeKoreanTitles.value = value;
  saveConfig("prioritizeKoreanTitles", value);
};

const onHideLibraryTagsChange = (value: boolean) => {
  hideLibraryTags.value = value;
  saveConfig("hideLibraryTags", value);
};

// info.txt 파일 생성
const generateMissingInfoFiles = async () => {
  isGeneratingInfoFiles.value = true;
  generationProgress.value = { current: 0, total: 0, message: "" }; // 상태 초기화
  try {
    const result = await ipcRenderer.invoke(
      "generate-missing-info-files",
      infoFilePattern.value,
    );
    // 최종 결과는 progress 핸들러가 아닌 토스트로 표시
    if (result.success) {
      toast.success("info.txt 파일 생성이 완료되었습니다.", {
        description: "라이브러리를 갱신해야 변경사항이 반영됩니다.",
      });
    } else {
      toast.error(result.error || "알 수 없는 오류가 발생했습니다.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`오류가 발생했습니다: ${message}`);
    isGeneratingInfoFiles.value = false; // 에러 발생 시 명시적으로 상태 종료
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- 스캔 진행률 표시 -->
    <LibraryScanProgress />

    <Card>
      <CardHeader>
        <CardTitle>라이브러리 폴더</CardTitle>
        <CardDescription
          >만화 파일이 저장된 폴더를 관리합니다. 폴더를 추가하면 자동으로 스캔이
          시작됩니다.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <div
            v-if="libraryFolders.length === 0"
            class="text-muted-foreground rounded-md border-2 border-dashed p-6 text-center text-sm"
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
              <p class="text-muted-foreground text-xs">
                {{ folder.bookCount || 0 }}권 | 마지막 스캔:
                {{
                  folder.lastScanned
                    ? new Date(folder.lastScanned).toLocaleString()
                    : "N/A"
                }}
              </p>
            </div>
            <div class="flex flex-shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                @click="openFolder(folder.path)"
              >
                <Icon
                  icon="solar:folder-open-bold-duotone"
                  class="h-5 w-5 text-gray-500"
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="rescanLibraryFolder(folder.path)"
              >
                <Icon
                  icon="solar:refresh-bold-duotone"
                  class="h-5 w-5 text-blue-500"
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="removeLibraryFolder(folder.path)"
              >
                <Icon
                  icon="solar:trash-bin-trash-bold-duotone"
                  class="h-5 w-5 text-red-500"
                />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button class="w-full" @click="addLibraryFolder">
          <Icon icon="solar:folder-add-bold-duotone" class="h-5 w-5" />
          라이브러리 폴더 추가
        </Button>
      </CardFooter>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>라이브러리 표시 설정</CardTitle>
        <CardDescription
          >라이브러리 화면에 표시되는 내용을 설정합니다.</CardDescription
        >
      </CardHeader>
      <CardContent class="space-y-6">
        <SettingItem
          label-for="prioritize-korean-titles"
          title="한국어 제목 우선 표시"
        >
          <template #subtitle>
            <p class="text-muted-foreground text-sm">
              제목에 한국어와 다른 언어가 함께 있을 경우 한국어를 우선적으로
              표시합니다. (예: 'Original Title | 한국어 제목' -> '한국어 제목')
            </p>
            <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
              <Icon
                icon="solar:danger-triangle-bold-duotone"
                class="inline-block h-4 w-4"
              />
              이 기능은 파일명의 형식이 일관되지 않은 경우 제목이 예상대로
              나타나지 않을 수 있습니다.
            </p>
          </template>
          <Switch
            id="prioritize-korean-titles"
            :model-value="prioritizeKoreanTitles"
            class="justify-self-end"
            @update:model-value="onPrioritizeKoreanTitlesChange"
          />
        </SettingItem>
        <SettingItem
          label-for="hide-library-tags"
          title="라이브러리 태그 목록 숨기기"
          subtitle="라이브러리에서 책 카드의 태그 목록을 숨깁니다."
        >
          <Switch
            id="hide-library-tags"
            :model-value="hideLibraryTags"
            class="justify-self-end"
            @update:model-value="onHideLibraryTagsChange"
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
          <Button variant="outline" @click="rescanAllMetadata">재스캔</Button>
        </SettingItem>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>info.txt 생성</CardTitle>
        <CardDescription
          >info.txt 파일이 없는 폴더를 찾아 폴더명 정규식 기반으로 파일을
          생성합니다.</CardDescription
        >
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-2">
          <Label for="info-file-pattern">폴더명 분석 정규식</Label>
          <Input
            id="info-file-pattern"
            v-model="infoFilePattern"
            placeholder="예: \((\d+)\)$"
          />
          <p class="text-muted-foreground text-sm">
            폴더명에서 갤러리 ID를 추출할 정규식을 입력합니다. 첫 번째 캡처
            그룹이 ID로 사용됩니다.
          </p>
        </div>
        <SettingItem
          label-for="generate-info-files"
          title="info.txt 생성"
          subtitle="info.txt 파일이 없는 폴더를 찾아 위 정규식을 기반으로 파일을 생성합니다."
        >
          <Button
            id="generate-info-files"
            variant="outline"
            class="justify-self-end"
            :disabled="isGeneratingInfoFiles"
            @click="generateMissingInfoFiles"
          >
            <Icon
              v-if="isGeneratingInfoFiles"
              icon="svg-spinners:ring-resize"
              class="mr-2 h-4 w-4"
            />
            생성 시작
          </Button>
        </SettingItem>
        <div
          v-if="isGeneratingInfoFiles || generationProgress.total > 0"
          class="space-y-2 pt-4"
        >
          <div class="text-muted-foreground flex justify-between text-sm">
            <span>진행률</span>
            <span
              >{{ generationProgress.current }} /
              {{ generationProgress.total }}</span
            >
          </div>
          <Progress
            :model-value="
              generationProgress.total > 0
                ? (generationProgress.current / generationProgress.total) * 100
                : 0
            "
            class="w-full"
          />
          <p class="text-muted-foreground truncate text-sm">
            {{ generationProgress.message }}
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
