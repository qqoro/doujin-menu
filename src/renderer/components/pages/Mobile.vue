<script setup lang="ts">
import { ipcRenderer } from "@/api";
import DevicesCard from "@/components/feature/mobile/DevicesCard.vue";
import TailscaleCard from "@/components/feature/mobile/TailscaleCard.vue";
import WifiCard from "@/components/feature/mobile/WifiCard.vue";
import SettingItem from "@/components/feature/settings/SettingItem.vue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { isHttpUrl } from "@/lib/mobilePage";
import { Icon } from "@iconify/vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import PageHeader from "../layout/PageHeader.vue";

defineOptions({ name: "Mobile" });

const queryClient = useQueryClient();

// keep-alive 대상이 아니므로 페이지를 떠나면 언마운트되어 Tailscale CLI 확인도 멈춘다
const {
  data: status,
  dataUpdatedAt,
  isFetching,
  refetch,
} = useQuery({
  queryKey: ["mobile-web-status"],
  queryFn: () => ipcRenderer.invoke("get-mobile-web-status"),
  refetchInterval: 5000,
});

// 5초 주기만 기다리면 만료된 코드의 QR이 몇 초 더 보인다
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => status.value?.pairing?.expiresAt,
  (expiresAt) => {
    clearTimeout(expiryTimer);
    if (!expiresAt) return;
    expiryTimer = setTimeout(
      () => void refetch(),
      Math.max(0, expiresAt - Date.now()) + 200,
    );
  },
);
onUnmounted(() => clearTimeout(expiryTimer));

const enabled = ref(false);
const portInput = ref("");
const portError = ref("");
const customUrl = ref("");
const customUrlError = ref("");

onMounted(async () => {
  const config = await ipcRenderer.invoke("get-config");
  enabled.value = config.mobileWebEnabled === true;
  portInput.value = String(config.mobileWebPort ?? 47900);
  customUrl.value = (config.mobileWebUrl as string | undefined) ?? "";
});

const refresh = () => {
  void queryClient.invalidateQueries({ queryKey: ["mobile-web-status"] });
  void queryClient.invalidateQueries({ queryKey: ["mobile-web-running"] });
};

const saveConfig = async (key: string, value: unknown) => {
  const result = await ipcRenderer.invoke("set-config", { key, value });
  if (!result.success && result.error) {
    toast.error("설정 저장에 실패했습니다.", { description: result.error });
  }
  void queryClient.invalidateQueries({ queryKey: ["config"] });
  refresh();
};

const onEnabledChange = (value: boolean) => {
  enabled.value = value;
  void saveConfig("mobileWebEnabled", value);
};

const onPortBlur = () => {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    portError.value = "1024~65535 사이의 숫자를 입력하세요.";
    portInput.value = String(status.value?.port ?? 47900);
    return;
  }
  portError.value = "";
  if (port !== status.value?.port) void saveConfig("mobileWebPort", port);
};

const onCustomUrlBlur = () => {
  const value = customUrl.value.trim();
  if (value && !isHttpUrl(value)) {
    customUrlError.value =
      "http:// 또는 https://로 시작하는 주소를 입력하세요.";
    return;
  }
  customUrlError.value = "";
  if (value !== (status.value?.customUrl ?? "")) {
    void saveConfig("mobileWebUrl", value);
  }
};

const revoke = async (id: string) => {
  const result = await ipcRenderer.invoke("revoke-mobile-device", id);
  if (!result.success && result.error) toast.error(result.error);
  refresh();
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader icon="solar:smartphone-2-bold-duotone" title="모바일" />

    <Card>
      <CardContent>
        <SettingItem label-for="mobile-web-enabled" title="모바일 접속">
          <template #subtitle>
            <p class="text-muted-foreground text-sm">
              켜 두면 앱이 실행 중일 때 휴대폰 브라우저에서 이 PC의 라이브러리를
              보고 읽을 수 있습니다.
              <template v-if="!enabled">
                <br />처음 켤 때 Windows 방화벽 허용 창이 한 번 뜹니다.
              </template>
            </p>
            <p v-if="status?.error" class="text-destructive text-sm">
              {{ status.error }}
            </p>
          </template>
          <Switch
            id="mobile-web-enabled"
            :model-value="enabled"
            @update:model-value="onEnabledChange"
          />
        </SettingItem>
      </CardContent>
    </Card>

    <template v-if="enabled && status?.running && status.pairing">
      <div class="grid gap-6 lg:grid-cols-2">
        <WifiCard
          :lan="status.lan"
          :pairing="status.pairing"
          @select-address="saveConfig('mobileWebLanAddress', $event)"
        />
        <TailscaleCard
          :tailscale="status.tailscale"
          :custom-url="
            status.customUrl && isHttpUrl(status.customUrl)
              ? status.customUrl
              : null
          "
          :pairing="status.pairing"
          :checked-at="dataUpdatedAt"
          :checking="isFetching"
          @recheck="refetch()"
        />
      </div>
      <DevicesCard :devices="status.devices" @revoke="revoke" />
    </template>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Icon
            icon="solar:tuning-2-bold-duotone"
            class="text-primary size-5"
          />
          고급 설정
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-6">
        <SettingItem
          label-for="mobile-web-port"
          title="포트"
          :subtitle="portError || '바꾸면 QR과 즐겨찾기 주소도 바뀝니다.'"
        >
          <Input
            id="mobile-web-port"
            v-model="portInput"
            type="number"
            class="w-32"
            @blur="onPortBlur"
          />
        </SettingItem>
        <SettingItem
          label-for="mobile-web-url"
          title="접속 주소 직접 입력"
          :subtitle="
            customUrlError ||
            'Tailscale 대신 쓰는 외부 주소가 있을 때만 입력하세요.'
          "
        >
          <Input
            id="mobile-web-url"
            v-model="customUrl"
            placeholder="https://"
            class="w-60"
            @blur="onCustomUrlBlur"
          />
        </SettingItem>
      </CardContent>
    </Card>
  </div>
</template>
