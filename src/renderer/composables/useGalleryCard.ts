import * as api from "@/api";
import { resolveCardStatus } from "@/lib/galleryCard";
import { useDownloadQueueStore } from "@/store/downloadQueueStore";
import type { Gallery } from "node-hitomi";
import { computed, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";

interface GalleryCardProps {
  gallery: Gallery & { thumbnailUrl: string };
  downloadStatus: { status: string; progress?: number; error?: string };
  /**
   * 라이브러리에 이미 있는 책의 ID. 없으면 null.
   *
   * 예전에는 카드가 마운트될 때마다 스스로 조회했습니다. 한 화면에 카드가
   * 30장이면 그것만으로 IPC 왕복이 30번이라, 지금은 상위에서 한 번에 조회한
   * 결과를 내려받습니다. 갱신 책임도 상위에 있습니다.
   */
  bookId?: number | null;
  /** 다운로드 경로. 이것도 카드마다 읽던 것을 상위 주입으로 바꿨습니다. */
  downloadPath?: string;
}

interface GalleryCardEmits {
  (event: "request-delete", gallery: Gallery): void;
}

export function useGalleryCard(
  props: GalleryCardProps,
  emit?: GalleryCardEmits,
) {
  const router = useRouter();
  const downloadQueueStore = useDownloadQueueStore();

  const bookId = computed(() => props.bookId ?? null);
  const downloadPath = computed(() => props.downloadPath ?? "");

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

  /**
   * 삭제 요청을 상위로 올립니다.
   *
   * 예전에는 카드가 다이얼로그를 직접 들고 있었습니다. 그런데 `AlertDialog`가
   * 카드의 두 번째 루트라, 다이얼로그를 연 채 목록을 스크롤해 그 카드가
   * 언마운트되면 다이얼로그까지 통째로 사라집니다. Reka UI가 잠그는 건 body
   * 스크롤인데 다운로더의 스크롤러는 내부 div라 스크롤이 막히지 않습니다.
   *
   * 가상 스크롤에서는 언마운트가 훨씬 잦으므로 다이얼로그를 페이지 레벨로
   * 올렸습니다. 카드는 "이걸 지우고 싶다"만 말합니다.
   */
  const handleDeleteGallery = () => {
    emit?.("request-delete", props.gallery);
  };

  // 클립보드에 복사 (RowCard용)
  const copyToClipboard = async (text: string) => {
    const formattedText = text.replaceAll(" ", "_");
    await navigator.clipboard.writeText(formattedText);
    toast.success(`${formattedText}가 클립보드에 복사되었습니다.`, {
      duration: 750,
    });
  };

  /**
   * 카드 상태 판정을 하나로 모읍니다.
   *
   * 아래 불리언들은 전부 이것에서 파생됩니다. 예전에는 각자 계산해서
   * "보유중이면서 실패"처럼 둘 다 참인 조합이 나왔고, 그때는 CSS 선언 순서가
   * 승자를 정했습니다. 배지 문구와 버튼 문구도 여기서 함께 나오므로 두 뷰의
   * 어휘가 갈라지지 않습니다.
   */
  const cardStatus = computed(() =>
    resolveCardStatus({
      bookId: bookId.value,
      status: props.downloadStatus.status,
      progress: props.downloadStatus.progress,
    }),
  );

  /** 라이브러리에 이미 있는 책인지. 배지 문구를 "보유중"으로 나누는 데 씁니다 */
  const isOwned = computed(() => bookId.value !== null);

  // 버튼 텍스트
  const buttonText = computed(() => cardStatus.value.buttonLabel);

  // 다운로드 중 여부
  const isDownloading = computed(() => cardStatus.value.kind === "downloading");

  // 다운로드 완료 여부 (라이브러리 보유중 포함)
  const isDownloadCompleted = computed(() => cardStatus.value.kind === "owned");

  // 다운로드 실패 여부
  const isDownloadFailed = computed(() => cardStatus.value.kind === "failed");

  return {
    bookId,
    cardStatus,
    isOwned,
    viewerLink,
    buttonText,
    isDownloading,
    isDownloadCompleted,
    isDownloadFailed,
    handleOpenBook,
    handleDownload,
    handleDeleteGallery,
    copyToClipboard,
  };
}
