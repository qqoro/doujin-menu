<script setup lang="ts">
import {
  addPreset,
  deletePreset,
  getPresets,
  ipcRenderer,
  updatePreset,
} from "@/api";
import PresetFormDialog from "@/components/feature/settings/PresetFormDialog.vue";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
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
import { useUiStore } from "@/store/uiStore";
import { Icon } from "@iconify/vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { AcceptableValue } from "reka-ui";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { Preset } from "../../../../../types/ipc";

const queryClient = useQueryClient();
const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", { description: result.error });
  }
  queryClient.invalidateQueries({ queryKey: ["config"] });
};

// 프리셋 관리 상태
const isPresetFormDialogOpen = ref(false);
const editingPreset = ref<Preset | null>(null);

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

// 일반 설정 상태
const autoLoadLibrary = ref(true);
const enableReadingHistory = ref(true);

// 화면 회전 설정 상태
const uiStore = useUiStore();
const screenRotation = ref<0 | 90 | 180 | 270>(0);

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  autoLoadLibrary.value = config.autoLoadLibrary !== false;
  enableReadingHistory.value = config.enableReadingHistory !== false;
  screenRotation.value = (config.screenRotation as 0 | 90 | 180 | 270) || 0;
});

// 스위치 변경 시 저장
const onAutoLoadChange = (value: boolean) => {
  autoLoadLibrary.value = value;
  saveConfig("autoLoadLibrary", value);
};

const onEnableReadingHistoryChange = (value: boolean) => {
  enableReadingHistory.value = value;
  saveConfig("enableReadingHistory", value);
};

// 화면 회전 변경 시 저장
const onScreenRotationChange = async (value: AcceptableValue) => {
  const rotation = Number(value) as 0 | 90 | 180 | 270;
  screenRotation.value = rotation;
  uiStore.setScreenRotation(rotation); // 즉시 UI 반영
  await saveConfig("screenRotation", rotation);
};
</script>

<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>일반 설정</CardTitle>
        <CardDescription>앱의 일반적인 동작을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
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
        <SettingItem
          label-for="enable-reading-history"
          title="읽음 기록"
          subtitle="책을 열람한 기록을 저장합니다."
        >
          <Switch
            id="enable-reading-history"
            :model-value="enableReadingHistory"
            class="justify-self-end"
            @update:model-value="onEnableReadingHistoryChange"
          />
        </SettingItem>
        <SettingItem
          label-for="screen-rotation"
          title="화면 회전"
          subtitle="원격 데스크톱 사용 시 유용합니다. (일부 UI 요소가 정상 표시되지 않을 수 있습니다)"
        >
          <Select
            id="screen-rotation"
            :model-value="String(screenRotation)"
            @update:model-value="onScreenRotationChange"
          >
            <SelectTrigger>
              <SelectValue placeholder="회전 각도 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0도 (기본)</SelectItem>
              <SelectItem value="90">90도</SelectItem>
              <SelectItem value="180">180도</SelectItem>
              <SelectItem value="270">270도</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>검색 프리셋 관리</CardTitle>
        <CardDescription
          >자주 사용하는 검색어 조합을 저장하고 관리합니다.</CardDescription
        >
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex justify-end">
          <Button @click="openPresetDialog()">
            <Icon icon="solar:add-circle-bold-duotone" class="h-5 w-5" />
            새 프리셋 추가
          </Button>
        </div>
        <div v-if="isLoadingPresets" class="text-muted-foreground text-center">
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
                <TableCell class="font-medium">{{ preset.name }}</TableCell>
                <TableCell class="text-muted-foreground">{{
                  preset.query
                }}</TableCell>
                <TableCell class="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    @click="openPresetDialog(preset)"
                  >
                    <Icon icon="solar:pen-bold-duotone" class="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger as-child>
                      <Button variant="ghost" size="icon">
                        <Icon
                          icon="solar:trash-bin-trash-bold-duotone"
                          class="h-4 w-4 text-red-500"
                        />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>프리셋 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                          '{{ preset.name }}' 프리셋을 정말로 삭제하시겠습니까?
                          이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                          @click="deletePresetMutation.mutate(preset.id)"
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
                  class="text-muted-foreground p-6 text-center"
                >
                  (없음)
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <PresetFormDialog
      :open="isPresetFormDialogOpen"
      :editing-preset="editingPreset"
      @update:open="closePresetDialog"
      @save="addUpdatePresetMutation.mutate($event)"
    />
  </div>
</template>
