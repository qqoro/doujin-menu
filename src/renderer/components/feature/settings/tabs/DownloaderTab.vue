<script setup lang="ts">
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
import { Input } from "@/components/ui/input";
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

const createInfoTxtFile = ref(true);
const downloadPattern = ref("%artist% - %title%");
const compressDownload = ref(false);
const compressFormat = ref<"cbz" | "zip">("cbz");
const capitalizeNames = ref(false);

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  createInfoTxtFile.value = config.createInfoTxtFile !== false;
  downloadPattern.value =
    (config.downloadPattern as string) || "%artist% - %title%";
  compressDownload.value = config.compressDownload === true;
  compressFormat.value = (config.compressFormat as "cbz" | "zip") || "cbz";
  capitalizeNames.value = config.capitalizeNames === true;
});

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

const onCapitalizeNamesChange = (value: boolean) => {
  capitalizeNames.value = value;
  saveConfig("capitalizeNames", value);
};
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>다운로더 설정</CardTitle>
      <CardDescription>다운로드 관련 동작을 설정합니다.</CardDescription>
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
          placeholder="[%artist%] %title% (%id%)"
          class="col-span-1"
          :model-value="downloadPattern"
          @update:model-value="onDownloadPatternChange($event as string)"
        />
      </SettingItem>
      <div class="text-muted-foreground col-span-3 text-sm">
        <p class="font-semibold">사용 가능한 변수</p>
        <ul class="ml-4 list-inside list-disc">
          <li><code>%artist%</code>: 작가명</li>
          <li><code>%title%</code>: 작품 제목</li>
          <li><code>%id%</code>: 갤러리 ID</li>
          <li><code>%language%</code>: 언어</li>
          <li><code>%groups%</code>: 그룹</li>
          <li><code>%series%</code>: 시리즈</li>
          <li><code>%character%</code>: 캐릭터</li>
          <li><code>%type%</code>: 타입</li>
        </ul>
        <p class="mt-2 font-semibold">Fallback 문법</p>
        <p class="mt-1">
          <code>%변수1|변수2%</code> 형식으로 사용하면, 첫 번째 변수가 없을 때
          두 번째 변수를 대신 사용합니다.
        </p>
        <ul class="ml-4 list-inside list-disc">
          <li><code>%artist|groups%</code>: 작가명 (없으면 그룹명)</li>
          <li><code>%artist|groups|series%</code>: 작가 → 그룹 → 시리즈 순</li>
        </ul>
        <p class="mt-2">예시: <code>[%artist|groups%] %title% (%id%)</code></p>
        <p class="mt-2 font-semibold">폴더 구분자</p>
        <p class="mt-1">
          <code>\</code> 또는 <code>/</code>를 쓰면 하위 폴더가 만들어집니다.
          작가나 그룹별로 폴더를 나눠 관리할 때 사용합니다.
        </p>
        <ul class="ml-4 list-inside list-disc">
          <li>
            <code>%groups%\[%artist%] %title%</code>: 그룹명 폴더 안에 작품 폴더
            생성
          </li>
        </ul>
      </div>
      <SettingItem
        label-for="capitalize-names"
        title="작가·그룹명 첫 글자 대문자"
        subtitle="영문 작가명·그룹명의 각 단어 첫 글자를 대문자로 바꿉니다. (예: hitomi zoa → Hitomi Zoa)"
      >
        <Switch
          id="capitalize-names"
          :model-value="capitalizeNames"
          class="justify-self-end"
          @update:model-value="onCapitalizeNamesChange"
        />
      </SettingItem>
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
</template>
