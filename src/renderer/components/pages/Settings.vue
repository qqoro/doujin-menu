<script lang="ts" setup>
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryAndParams } from "@/composable/useQueryAndParams";
import { useLibraryScanStore } from "@/store/libraryScanStore";
import { Icon } from "@iconify/vue";
import PageHeader from "../layout/PageHeader.vue";
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppearanceTab from "../feature/settings/tabs/AppearanceTab.vue";
import GeneralTab from "../feature/settings/tabs/GeneralTab.vue";
import LibraryTab from "../feature/settings/tabs/LibraryTab.vue";
import ViewerTab from "../feature/settings/tabs/ViewerTab.vue";
import DownloaderTab from "../feature/settings/tabs/DownloaderTab.vue";
import DataSecurityTab from "../feature/settings/tabs/DataSecurityTab.vue";
import AboutTab from "../feature/settings/tabs/AboutTab.vue";
import KeybindingSettings from "../feature/settings/KeybindingSettings.vue";

const route = useRoute();

// 유효한 탭 value
const VALID_TABS = [
  "appearance",
  "general",
  "library",
  "viewer",
  "downloader",
  "keybindings",
  "data-security",
  "about",
] as const;

// 제거/변경된 예전 탭 value → 현재 탭으로 폴백
const TAB_ALIAS: Record<string, string> = {
  presets: "general",
  advanced: "data-security",
  etc: "about",
};

const normalizeTab = (v: string): string => {
  if (TAB_ALIAS[v]) return TAB_ALIAS[v];
  if ((VALID_TABS as readonly string[]).includes(v)) return v;
  return "general";
};

const tab = ref(normalizeTab((route.query.tab as string) || "general"));

useQueryAndParams({
  defaultOptions: {
    tab: "general",
  },
  queries: {
    tab,
  },
});

// useQueryAndParams가 라우트 변경을 ref에 반영한 뒤 알리아스/무효 value 정규화
watch(tab, (v) => {
  const normalized = normalizeTab(v);
  if (normalized !== v) tab.value = normalized;
});

onMounted(() => {
  // 라이브러리 스캔 Store 초기화 (LibraryTab의 LibraryScanProgress가 사용)
  const libraryScanStore = useLibraryScanStore();
  libraryScanStore.initialize();
});
</script>

<template>
  <div class="flex h-full flex-col gap-6">
    <PageHeader icon="solar:settings-bold-duotone" title="설정" />

    <Tabs v-model="tab" orientation="vertical">
      <div class="grid w-full grid-cols-1 gap-6 md:grid-cols-4">
        <div class="md:col-span-1">
          <div class="md:sticky md:top-0">
            <TabsList class="h-auto w-full flex-col items-stretch">
              <TabsTrigger value="appearance" class="justify-start px-3 py-2">
                <Icon icon="solar:palette-linear" class="h-5 w-5" />
                외관
              </TabsTrigger>
              <TabsTrigger value="general" class="justify-start px-3 py-2">
                <Icon icon="solar:settings-linear" class="h-5 w-5" />
                일반
              </TabsTrigger>
              <TabsTrigger value="library" class="justify-start px-3 py-2">
                <Icon icon="solar:folder-with-files-linear" class="h-5 w-5" />
                라이브러리
              </TabsTrigger>
              <TabsTrigger value="viewer" class="justify-start px-3 py-2">
                <Icon icon="solar:display-linear" class="h-5 w-5" />
                뷰어
              </TabsTrigger>
              <TabsTrigger value="keybindings" class="justify-start px-3 py-2">
                <Icon icon="solar:keyboard-linear" class="h-5 w-5" />
                단축키
              </TabsTrigger>
              <TabsTrigger value="downloader" class="justify-start px-3 py-2">
                <Icon icon="solar:download-square-linear" class="h-5 w-5" />
                다운로더
              </TabsTrigger>
              <TabsTrigger
                value="data-security"
                class="justify-start px-3 py-2"
              >
                <Icon icon="solar:shield-check-linear" class="h-5 w-5" />
                데이터 · 보안
              </TabsTrigger>
              <TabsTrigger value="about" class="justify-start px-3 py-2">
                <Icon icon="solar:info-circle-linear" class="h-5 w-5" />
                정보 · 업데이트
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div class="h-full overflow-y-auto pb-6 md:col-span-3">
          <TabsContent value="appearance" class="mt-0">
            <AppearanceTab />
          </TabsContent>

          <TabsContent value="general" class="mt-0">
            <GeneralTab />
          </TabsContent>

          <TabsContent value="library" class="mt-0">
            <LibraryTab />
          </TabsContent>

          <TabsContent value="viewer" class="mt-0">
            <ViewerTab />
          </TabsContent>

          <TabsContent value="keybindings" class="mt-0">
            <KeybindingSettings />
          </TabsContent>

          <TabsContent value="downloader" class="mt-0">
            <DownloaderTab />
          </TabsContent>

          <TabsContent value="data-security" class="mt-0">
            <DataSecurityTab />
          </TabsContent>

          <TabsContent value="about" class="mt-0">
            <AboutTab />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  </div>
</template>
