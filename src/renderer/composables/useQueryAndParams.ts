import {
  computed,
  onActivated,
  onDeactivated,
  ref,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type UnwrapRef,
} from "vue";
import { useRoute, useRouter } from "vue-router";

type DefaultOptions<T> = {
  page?: number;
  pageSize?: number;
  searchType?: string;
  schWord?: string;
} & (
  | {
      [K in keyof T]?: UnwrapRef<T[K]>;
    }
  | undefined
);

const initialDefaultOptions = {
  page: 1,
  pageSize: 10,
  searchType: "",
  schWord: "",
} as const;

function queryParamsProcessor(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value.toString();
  if (value instanceof Date) return value.toISOString();

  return "";
}

export function useQueryAndParams<
  T extends Record<string, MaybeRefOrGetter<unknown>>,
>(options?: {
  defaultOptions?: DefaultOptions<T>;
  queries: T;
  resetQueries?: () => void;
  /**
   * 쿼리 없는 주소로 들어왔을 때 상태를 초기화할지 여부. 기본값 true.
   *
   * 사이드바 링크는 쿼리 없는 경로(`/library` 등)로 이동시킨다. 그래서
   * "쿼리가 비었다"는 신호가 두 가지 의미로 겹친다 — 새로 보겠다는 뜻일 수도,
   * 설정에 잠깐 들렀다 돌아온 것일 수도 있다. 후자에서 상태가 날아가는 게
   * 문제라 라이브러리는 이 옵션을 false로 두고, 초기화는 명시적인 버튼으로만
   * 하도록 분리했다.
   */
  resetOnEmptyQuery?: boolean;
}) {
  const {
    defaultOptions,
    queries = {} as T,
    resetQueries,
    resetOnEmptyQuery = true,
  } = options ?? {};
  const route = useRoute();
  const router = useRouter();

  // keep-alive 환경에서 비활성 페이지의 route.query 와쳐 무시
  const isActive = ref(true);
  onActivated(() => {
    isActive.value = true;
  });
  onDeactivated(() => {
    isActive.value = false;
  });

  const currentDefaultOptions = {
    ...(defaultOptions as DefaultOptions<T>),
    page: defaultOptions?.page ?? initialDefaultOptions?.page ?? 1,
    pageSize: defaultOptions?.pageSize ?? initialDefaultOptions?.pageSize ?? 10,
    searchType:
      defaultOptions?.searchType ?? initialDefaultOptions?.searchType ?? "",
    schWord: defaultOptions?.schWord ?? initialDefaultOptions?.schWord ?? "",
  };

  const page = ref(Number(route.query.page) || currentDefaultOptions.page);
  const pageSize = ref(
    Number(route.query.pageSize) || currentDefaultOptions.pageSize,
  );
  const searchType = ref<string>(
    (route.query.searchType as string) || currentDefaultOptions.searchType,
  );
  const schWord = ref<string>(
    (route.query.schWord as string) || currentDefaultOptions.schWord,
  );
  const firstRowIndex = computed(() => (page.value - 1) * pageSize.value);

  const updateQueryParams = () => {
    const currentPath = route.path;
    const newQueryParams: Record<string, string | undefined> = {
      page:
        page.value !== currentDefaultOptions?.page
          ? page.value.toString()
          : undefined,
      pageSize:
        pageSize.value !== currentDefaultOptions?.pageSize
          ? pageSize.value.toString()
          : undefined,
      searchType:
        searchType.value !== currentDefaultOptions?.searchType
          ? searchType.value.toString()
          : undefined,
      schWord:
        schWord.value !== currentDefaultOptions?.schWord
          ? schWord.value.toString()
          : undefined,
    };

    if (queries) {
      const list = Object.entries(queries) as [string, Ref<unknown>][];
      list.forEach(([k, v]) => {
        // 없거나 빈 값인 경우 파라미터에 추가 안함
        if (v.value === undefined || v.value === null || v.value === "") {
          return;
        }
        // 기본값이랑 같으면 추가 안함
        if (
          k in currentDefaultOptions &&
          currentDefaultOptions[k] === v.value
        ) {
          return;
        }

        newQueryParams[k] = queryParamsProcessor(v.value);
      });
    }

    const q = new URLSearchParams(
      Object.entries(newQueryParams).filter(([, v]) => v) as string[][],
    );

    let finalPath = currentPath.split("?")[0];
    if (q.size > 0) {
      finalPath += "?" + q.toString();
    }
    router.replace(finalPath);
  };

  const reset = () => {
    page.value = currentDefaultOptions.page;
    pageSize.value = currentDefaultOptions.pageSize;
    searchType.value = currentDefaultOptions.searchType;
    schWord.value = currentDefaultOptions.schWord;

    if (queries) {
      const list = Object.entries(queries) as [string, Ref<unknown>][];
      list.forEach(([k, v]) => {
        if (k in currentDefaultOptions) {
          v.value = currentDefaultOptions[k];
        }
      });
    }

    resetQueries?.();
  };

  // 내부 상태 변경 시 URL 쿼리 업데이트 (무한 루프 방지를 위해 플래그 사용)
  let isUpdatingFromRoute = false;

  watch([page, pageSize, searchType, schWord], () => {
    if (!isUpdatingFromRoute) {
      updateQueryParams();
    }
  });
  watch(Object.values(queries ?? {}), () => {
    if (!isUpdatingFromRoute) {
      updateQueryParams();
    }
  });

  // route.query 변경 감지 및 내부 상태 업데이트
  // keep-alive 비활성 상태에서는 다른 페이지의 URL 변경 무시
  watch(
    [() => route.query, isActive],
    ([newQuery, active]) => {
      if (!active) return;

      isUpdatingFromRoute = true;

      // route.query가 비어있으면 reset 호출.
      // resetOnEmptyQuery가 false면 지금 상태를 그대로 둔다.
      if (Object.keys(newQuery).length === 0) {
        if (resetOnEmptyQuery) {
          reset();
        }
        isUpdatingFromRoute = false;
        return;
      }

      // route.query 값들을 내부 상태에 반영
      page.value = newQuery.page
        ? Number(newQuery.page)
        : currentDefaultOptions.page;
      pageSize.value = newQuery.pageSize
        ? Number(newQuery.pageSize)
        : currentDefaultOptions.pageSize;
      searchType.value =
        (newQuery.searchType as string) ?? currentDefaultOptions.searchType;
      schWord.value =
        (newQuery.schWord as string) ?? currentDefaultOptions.schWord;

      // queries에 포함된 파라미터들도 업데이트
      if (queries) {
        const list = Object.entries(queries) as [string, Ref<unknown>][];
        list.forEach(([k, v]) => {
          if (k in newQuery) {
            // 타입에 맞게 변환
            const queryValue = newQuery[k];
            if (queryValue !== undefined) {
              if (typeof v.value === "number") {
                v.value = Number(queryValue) as UnwrapRef<T[typeof k]>;
              } else if (typeof v.value === "boolean") {
                v.value = (queryValue === "true") as UnwrapRef<T[typeof k]>;
              } else {
                v.value = queryValue as UnwrapRef<T[typeof k]>;
              }
            } else if (k in currentDefaultOptions) {
              // 쿼리에 없으면 기본값으로 복원
              v.value = currentDefaultOptions[k] as UnwrapRef<T[typeof k]>;
            }
          }
        });
      }

      isUpdatingFromRoute = false;
    },
    { deep: true, immediate: true }, // 중첩된 객체 변경 감지를 위해 deep 옵션 사용, 즉시 실행
  );

  return {
    page,
    pageSize,
    searchType,
    schWord,
    queries,
    firstRowIndex,
    reset,
  };
}
