<script setup lang="ts">
import QRCode from "qrcode";
import { ref, watch } from "vue";

const props = defineProps<{ value: string }>();

const image = ref("");

watch(
  () => props.value,
  async (value) => {
    image.value = await QRCode.toDataURL(value, { width: 176, margin: 1 });
  },
  { immediate: true },
);
</script>

<template>
  <img
    v-if="image"
    :src="image"
    alt="접속용 QR 코드"
    class="size-36 shrink-0 rounded-md bg-white"
  />
</template>
