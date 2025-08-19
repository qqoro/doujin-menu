import {
  computed,
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

  console.log(value);
  return "";
}

export function useQueryAndParams<
  T extends Record<string, MaybeRefOrGetter<unknown>>,
>(options?: {
  defaultOptions?: DefaultOptions<T>;
  queries: T;
  resetQueries?: () => void;
}) {
  const { defaultOptions, queries = {} as T, resetQueries } = options ?? {};
  const route = useRoute();
  const router = useRouter();

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

  watch([page, pageSize, searchType, schWord], () => updateQueryParams());
  watch(Object.values(queries ?? {}), () => updateQueryParams());

  // route.query 변경 감지 및 내부 상태 업데이트
  watch(
    () => route.query,
    (newQuery) => {
      // route.query가 비어있으면 reset 호출
      if (Object.keys(newQuery).length === 0) {
        reset();
      }
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
