<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ref, watch } from "vue";
import { useMutation } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { createSeriesCollection } from "../../api";

interface Props {
  open: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  created: [];
}>();

// 폼 데이터
const name = ref("");
const description = ref("");

// 시리즈 생성 뮤테이션
const createMutation = useMutation({
  mutationFn: (data: { name: string; description?: string }) =>
    createSeriesCollection(data),
  onSuccess: () => {
    toast.success("시리즈가 생성되었습니다");
    emit("created");
    emit("update:open", false);
    resetForm();
  },
  onError: (error) => {
    toast.error(`생성 실패: ${error.message}`);
  },
});

// 폼 초기화
const resetForm = () => {
  name.value = "";
  description.value = "";
};

// 다이얼로그 열릴 때 폼 초기화
watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
    }
  },
);

// 생성 처리
const handleCreate = () => {
  if (!name.value.trim()) {
    toast.error("시리즈명을 입력해주세요");
    return;
  }

  createMutation.mutate({
    name: name.value.trim(),
    description: description.value.trim() || undefined,
  });
};
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-[500px]">
      <DialogHeader>
        <DialogTitle>새 시리즈 만들기</DialogTitle>
        <DialogDescription>
          빈 시리즈를 만들고 나중에 책을 추가할 수 있습니다
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- 시리즈명 -->
        <div class="space-y-2">
          <Label for="series-name">시리즈명 *</Label>
          <Input
            id="series-name"
            v-model="name"
            placeholder="시리즈 이름을 입력하세요"
            @keydown.enter="handleCreate"
          />
        </div>

        <!-- 설명 -->
        <div class="space-y-2">
          <Label for="series-description">설명 (선택)</Label>
          <Textarea
            id="series-description"
            v-model="description"
            placeholder="시리즈에 대한 설명을 입력하세요"
            rows="3"
          />
        </div>

        <!-- 버튼 -->
        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="emit('update:open', false)">
            취소
          </Button>
          <Button
            :disabled="createMutation.isPending.value || !name.trim()"
            @click="handleCreate"
          >
            생성
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
