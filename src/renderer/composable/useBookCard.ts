import * as api from "@/api";
import {
  buildBookMenuItems,
  buildCoverUrl,
  filterValidNames,
  hasCreatorInfo,
} from "@/lib/bookCard";
import type { CreditSource } from "@/lib/cardLayout";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import type { Book } from "../../types/ipc";

/**
 * 컴포저블이 실제로 올리는 이벤트만 나열한다.
 *
 * `event: string`으로 넓게 잡으면 `defineEmits`가 만드는 리터럴 유니온을 받지
 * 못한다(매개변수는 반공변이라 좁은 쪽만 대입된다).
 */
type BookCardEmit = {
  (event: "toggle-favorite", id: number, isFavorite: Book["is_favorite"]): void;
  (event: "open-book-folder", path: string): void;
  (event: "request-delete", book: Book): void;
  (event: "show-details", book: Book): void;
  (event: "show-preview", book: Book): void;
};

/**
 * 그리드 카드와 리스트 카드가 공유하는 동작.
 *
 * 두 카드는 생김새만 다르고 뷰어 진입·오프라인 처리·즐겨찾기·재스캔이 전부
 * 같은데 각자 복사해서 들고 있었다. 한쪽만 고쳐서 어긋나는 걸 막는다.
 *
 * 삭제는 여기 없다. 다이얼로그를 카드가 들고 있으면 가상 스크롤에서 카드가
 * 언마운트될 때 같이 사라지므로 페이지 레벨의 `useBookDelete`로 뺐다.
 */
export function useBookCard(
  props: {
    book: Book;
    queryKey: readonly unknown[];
    externalImageViewerPath?: string;
    externalArchiveViewerPath?: string;
  },
  emit: BookCardEmit,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const viewerLink = computed(() => ({
    name: "Viewer",
    params: { id: props.book.id },
    query: {
      filter: JSON.stringify(toRaw(props.queryKey[1])),
    },
  }));

  // 오프라인 상태 여부 (라이브러리 폴더 접근 불가)
  const isOffline = computed(() => !!props.book.is_offline);

  // 오프라인 책 열람 시도 시 안내 토스트
  const showOfflineToast = () => {
    toast.warning("라이브러리 폴더에 접근할 수 없습니다.", {
      description: "해당 폴더에 접근할 수 있는지 확인한 후 다시 스캔해 주세요.",
    });
  };

  const openInNewWindow = () => {
    if (isOffline.value) {
      showOfflineToast();
      return;
    }
    const url = `/viewer/${viewerLink.value.params.id}?${new URLSearchParams(viewerLink.value.query).toString()}`;
    api.openNewWindow(url);
  };

  const handleCardClick = (event: MouseEvent) => {
    if (isOffline.value) {
      showOfflineToast();
      return;
    }
    // metaKey는 macOS의 Command 키
    if (event.ctrlKey || event.metaKey) {
      openInNewWindow();
    } else {
      router.push(viewerLink.value);
    }
  };

  // 재스캔 후 같은 경로에 새 썸네일이 쓰이므로 URL을 바꿔 캐시를 무효화한다
  const thumbnailKey = ref(0);
  const coverUrl = computed(() =>
    buildCoverUrl(props.book.cover_path, thumbnailKey.value),
  );

  const validArtists = computed(() => filterValidNames(props.book.artists));
  const validGroups = computed(() => filterValidNames(props.book.groups));
  const validSeries = computed(() => filterValidNames(props.book.series));
  const validCharacters = computed(() =>
    filterValidNames(props.book.characters),
  );
  const hasCreator = computed(() =>
    hasCreatorInfo(validArtists.value, validGroups.value),
  );

  /** 크레딧 줄 컴포넌트가 받는 모양. 다운로더 갤러리와 같은 이름 배열이다 */
  const credits = computed<CreditSource>(() => ({
    artists: validArtists.value.map((item) => item.name),
    groups: validGroups.value.map((item) => item.name),
    series: validSeries.value.map((item) => item.name),
    characters: validCharacters.value.map((item) => item.name),
  }));

  // 외부 뷰어는 아카이브(cbz/zip)와 폴더가 서로 다른 경로를 쓴다
  const hasExternalViewer = computed(() => {
    const isArchive = /\.(cbz|zip)$/i.test(props.book.path || "");
    return isArchive
      ? !!props.externalArchiveViewerPath
      : !!props.externalImageViewerPath;
  });

  const openWithExternalViewer = async () => {
    try {
      await api.openBookWithExternalViewer(props.book.id);
      toast.success("외부 프로그램으로 열었습니다.");
    } catch (error) {
      toast.error("외부 프로그램 실행 실패", {
        description: (error as Error).message,
      });
    }
  };

  const toggleFavorite = () => {
    emit("toggle-favorite", props.book.id, props.book.is_favorite);
  };

  const openBookFolder = () => {
    emit("open-book-folder", props.book.path);
  };

  const isRescanning = ref(false);

  const handleRescanMetadata = async () => {
    if (isRescanning.value) return;
    isRescanning.value = true;
    try {
      await api.rescanBookMetadata(props.book.id);
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      thumbnailKey.value = Date.now();
      toast.success("메타데이터 재스캔 완료", {
        description: `${props.book.title}의 메타데이터가 갱신되었습니다.`,
      });
    } catch (error) {
      console.error("메타데이터 재스캔 실패:", error);
      toast.error("재스캔 실패", {
        description: "메타데이터를 갱신하는 중 오류가 발생했습니다.",
      });
    } finally {
      isRescanning.value = false;
    }
  };

  /** 삭제는 페이지가 처리하므로 카드는 요청만 올린다 */
  const requestDelete = () => {
    emit("request-delete", toRaw(props.book));
  };

  /**
   * 카드 메뉴 항목.
   *
   * 우클릭 메뉴와 ⋮ 버튼이 이 배열 하나를 같이 그린다. 우클릭만으로는 폴더
   * 열기·상세 정보·재스캔이 있다는 걸 알 수 없어 ⋮를 같이 둔다.
   */
  const menuItems = computed(() =>
    buildBookMenuItems(
      {
        isFavorite: !!props.book.is_favorite,
        hasExternalViewer: hasExternalViewer.value,
        isRescanning: isRescanning.value,
      },
      {
        favorite: toggleFavorite,
        folder: openBookFolder,
        newWindow: openInNewWindow,
        external: openWithExternalViewer,
        details: () => emit("show-details", props.book),
        preview: () => emit("show-preview", props.book),
        rescan: handleRescanMetadata,
        delete: requestDelete,
      },
    ),
  );

  return {
    menuItems,
    viewerLink,
    isOffline,
    showOfflineToast,
    openInNewWindow,
    handleCardClick,
    thumbnailKey,
    coverUrl,
    validArtists,
    validGroups,
    validSeries,
    validCharacters,
    hasCreator,
    credits,
    hasExternalViewer,
    openWithExternalViewer,
    toggleFavorite,
    openBookFolder,
    isRescanning,
    handleRescanMetadata,
    requestDelete,
  };
}
