import * as api from "@/api";
import { ipcRenderer } from "@/api";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import type { Gallery } from "node-hitomi";
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";

interface GalleryCardProps {
  gallery: Gallery & { thumbnailUrl: string };
  downloadStatus: { status: string; progress?: number; error?: string };
}

interface GalleryCardEmits {
  (event: "book-deleted", galleryId: number): void;
}

export function useGalleryCard(
  props: GalleryCardProps,
  emit?: GalleryCardEmits,
) {
  const bookId = ref<number | null>(null);
  const router = useRouter();
  const downloadQueueStore = useDownloadQueueStore();
  const isDeleteDialogOpen = ref(false);
  const downloadPath = ref<string>("");

  // 책 존재 여부 확인
  const checkBookExists = async () => {
    if (props.gallery.id) {
      const result = await ipcRenderer.invoke(
        "check-book-exists-by-hitomi-id",
        props.gallery.id,
      );
      if (result.success && result.exists) {
        bookId.value = result.bookId ?? null;
      }
    }
  };

  // 뷰어 링크
  const viewerLink = computed(() => ({
    name: "Viewer",
    params: { id: bookId.value },
    query: {
      filter: JSON.stringify(toRaw({ hitomi_id: props.gallery.id })),
    },
  }));

  // 새 창에서 책 열기
  const openBookInNewWindow = () => {
    const url = `/viewer/${viewerLink.value.params.id}?${new URLSearchParams(viewerLink.value.query).toString()}`;
    api.openNewWindow(url);
  };

  // 책 열기 (Ctrl/Cmd 클릭 시 새 창)
  const handleOpenBook = (event: MouseEvent) => {
    if (!bookId.value) return;
    if (event.ctrlKey || event.metaKey) {
      openBookInNewWindow();
    } else {
      router.push(viewerLink.value);
    }
  };

  // 다운로드
  const handleDownload = async () => {
    if (!downloadPath.value) {
      toast.error("다운로드 폴더를 먼저 지정해주세요.");
      return;
    }

    try {
      await downloadQueueStore.addToQueue({
        galleryId: props.gallery.id,
        galleryTitle: props.gallery.title.display,
        galleryArtist: props.gallery.artists?.[0],
        thumbnailUrl: props.gallery.thumbnailUrl,
        downloadPath: downloadPath.value,
      });
      toast.success("다운로드 큐에 추가되었습니다.", {
        description: props.gallery.title.display,
      });
    } catch (error) {
      toast.error("큐 추가 실패", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // 삭제 다이얼로그 열기
  const handleDeleteGallery = () => {
    isDeleteDialogOpen.value = true;
  };

  // 삭제 확인
  const confirmDeleteGallery = async () => {
    // 삭제 시점에 bookId를 직접 조회
    const result = await ipcRenderer.invoke(
      "check-book-exists-by-hitomi-id",
      props.gallery.id,
    );

    if (!result.success || !result.exists || !result.bookId) {
      toast.error("삭제할 책 정보를 찾을 수 없습니다.");
      isDeleteDialogOpen.value = false;
      return;
    }

    try {
      await api.deleteBook(result.bookId);
      toast.success("책 삭제 완료", {
        description: `${props.gallery.title.display}이(가) 삭제되었습니다.`,
      });
      bookId.value = null; // 책 삭제 후 bookId 초기화
      // 삭제 후 상태 업데이트
      await checkBookExists();
      // 부모 컴포넌트에 삭제 이벤트 전달
      if (emit) {
        emit("book-deleted", props.gallery.id);
      }
    } catch (error) {
      console.error("책 삭제 실패:", error);
      toast.error("책 삭제 실패", {
        description: "책을 삭제하는 중 오류가 발생했습니다.",
      });
    } finally {
      isDeleteDialogOpen.value = false;
    }
  };

  // 클립보드에 복사 (RowCard용)
  const copyToClipboard = async (text: string) => {
    const formattedText = text.replaceAll(" ", "_");
    await navigator.clipboard.writeText(formattedText);
    toast.success(`${formattedText}가 클립보드에 복사되었습니다.`, {
      duration: 750,
    });
  };

  // 버튼 텍스트
  const buttonText = computed(() => {
    if (bookId.value) {
      return "완료";
    }
    switch (props.downloadStatus.status) {
      case "starting":
        return "시작 중...";
      case "pending":
        return "대기 중";
      case "paused":
        return "일시정지";
      case "progress":
        return `${props.downloadStatus.progress || 0}%`;
      case "completed":
        return "완료";
      case "failed":
        return "실패";
      default:
        return "다운로드";
    }
  });

  // 다운로드 중 여부
  const isDownloading = computed(() => {
    return (
      !bookId.value &&
      (props.downloadStatus.status === "starting" ||
        props.downloadStatus.status === "progress" ||
        props.downloadStatus.status === "pending" ||
        props.downloadStatus.status === "paused")
    );
  });

  // 다운로드 완료 여부
  const isDownloadCompleted = computed(() => {
    return bookId.value || props.downloadStatus.status === "completed";
  });

  // 다운로드 실패 여부
  const isDownloadFailed = computed(() => {
    return props.downloadStatus.status === "failed";
  });

  // 마운트 시 책 존재 여부 확인 및 다운로드 경로 불러오기
  onMounted(async () => {
    await checkBookExists();

    // 다운로드 경로 불러오기
    const path = await ipcRenderer.invoke("get-config-value", "downloadPath");
    if (path) {
      downloadPath.value = path as string;
    }
  });

  // 다운로드 상태가 completed로 변경되면 bookId 다시 확인
  watch(
    () => props.downloadStatus.status,
    async (newStatus) => {
      if (newStatus === "completed" && !bookId.value) {
        await checkBookExists();
      }
    },
  );

  return {
    bookId,
    isDeleteDialogOpen,
    viewerLink,
    buttonText,
    isDownloading,
    isDownloadCompleted,
    isDownloadFailed,
    checkBookExists,
    handleOpenBook,
    handleDownload,
    handleDeleteGallery,
    confirmDeleteGallery,
    copyToClipboard,
  };
}
