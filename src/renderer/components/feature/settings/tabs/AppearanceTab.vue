<script setup lang="ts">
import { ipcRenderer } from "@/api";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
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
import { useTheme } from "@/composable/useTheme";
import { themeList } from "@/lib/themeList";
import { ColorTheme } from "@/types/themes";
import { useQueryClient } from "@tanstack/vue-query";
import { useColorMode } from "@vueuse/core";
import { AcceptableValue } from "reka-ui";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const queryClient = useQueryClient();
const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", { description: result.error });
  }
  queryClient.invalidateQueries({ queryKey: ["config"] });
};

const theme = useColorMode();
const { setTheme } = useTheme();
const colorTheme = ref<ColorTheme>("cosmic-night");

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  theme.value = (config.theme as "light" | "dark" | "auto") || "auto";
  colorTheme.value = (config.colorTheme as ColorTheme) || "cosmic-night";
});

const onThemeChange = (newTheme: AcceptableValue) => {
  theme.value = newTheme as "light" | "dark" | "auto";
  saveConfig("theme", newTheme);
};

const onColorThemeChange = async (newTheme: AcceptableValue) => {
  const themeValue = newTheme as ColorTheme;
  colorTheme.value = themeValue;
  await setTheme(themeValue);
};
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>외관 설정</CardTitle>
      <CardDescription>앱의 테마와 색상을 설정합니다.</CardDescription>
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
          <p class="text-muted-foreground text-sm">
            앱의 전체적인 색상 테마를 선택합니다. 변경 시 즉시 적용됩니다.
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            <a
              href="https://tweakcn.com/#examples"
              class="text-primary cursor-pointer hover:underline"
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
              v-for="themeItem in themeList"
              :key="themeItem.value"
              :value="themeItem.value"
            >
              {{ themeItem.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </CardContent>
  </Card>
</template>
