import * as api from "@/api";
import { ipcRenderer } from "@/api";
import { usePermanentDelete } from "@/composable/usePermanentDelete";
import type { Gallery } from "node-hitomi";
import { ref } from "vue";
import { toast } from "vue-sonner";

/**
 * 다운로더 삭제 다이얼로그의 페이지 레벨 상태.
 *
 * 카드가 각자 `AlertDialog`를 들고 있으면, 다이얼로그를 연 채 목록을 스크롤해
 * 그 카드가 언마운트될 때 다이얼로그까지 사라집니다. Reka UI가 잠그는 건 body
 * 스크롤인데 다운로더의 스크롤러는 내부 div라 스크롤이 막히지 않기 때문입니다.
 * 가상 스크롤은 언마운트가 훨씬 잦아 이 문제가 확실해집니다.
 *
 * 다이얼로그를 페이지에 하나만 두고, 카드는 `request-delete`만 올립니다.
 *
 * @param onDeleted 삭제 성공 후 호출됩니다. 보유 여부 맵 갱신에 씁니다.
 */
export function useGalleryDelete(onDeleted?: (galleryId: number) => void) {
  const isOpen = ref(false);
  const target = ref<Gallery | null>(null);

  // 영구 삭제 체크 상태 (모든 삭제 다이얼로그 공유, localStorage 유지)
  const { permanentDelete } = usePermanentDelete();

  const requestDelete = (gallery: Gallery) => {
    target.value = gallery;
    isOpen.value = true;
  };

  const confirmDelete = async () => {
    const gallery = target.value;
    if (!gallery) return;

    // 삭제 시점에 bookId를 직접 조회합니다. 목록이 들고 있는 값은
    // 다른 창에서 지웠을 경우 낡아 있을 수 있습니다.
    const result = await ipcRenderer.invoke(
      "check-book-exists-by-hitomi-id",
      gallery.id,
    );

    if (!result.success || !result.exists || !result.bookId) {
      toast.error("삭제할 책 정보를 찾을 수 없습니다.");
      isOpen.value = false;
      return;
    }

    try {
      // 체크 상태에 따라 영구 삭제
      await api.deleteBook(result.bookId, { permanent: permanentDelete.value });
      toast.success("책 삭제 완료", {
        description: `${gallery.title.display}이(가) 삭제되었습니다.`,
      });
      onDeleted?.(gallery.id);
    } catch (error) {
      console.error("책 삭제 실패:", error);
      toast.error("책 삭제 실패", {
        description:
          (error as Error).message || "책을 삭제하는 중 오류가 발생했습니다.",
      });
    } finally {
      isOpen.value = false;
    }
  };

  return { isOpen, target, permanentDelete, requestDelete, confirmDelete };
}
