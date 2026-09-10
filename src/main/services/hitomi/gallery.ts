import { Extension, ThumbnailSize, type Gallery } from "node-hitomi";
import type { GalleryDto } from "../../../types/ipc.js";
import type { DownloadNameSource } from "../../utils/index.js";
import { toNames } from "./tags.js";

/**
 * 라이브러리가 돌려주는 URL은 스킴이 없는 `//host/path` 형태입니다.
 * `https://`를 앞에 붙이면 슬래시가 네 개가 되므로 스킴만 붙입니다.
 */
const toHttpsUrl = (url: string): string => `https:${url}`;

/**
 * 내려받을 이미지 형식입니다.
 *
 * avif로 바꾸지 마세요. 용량은 작지만 라이브러리 스캐너가 읽는 확장자 목록에
 * avif가 없어서, 받아 놓고 책으로 잡히지 않는 폴더가 생깁니다.
 */
const DOWNLOAD_EXTENSION = Extension.Webp;

/** 목록·카드에 쓰는 썸네일 URL입니다 */
export const resolveThumbnailUrl = async (gallery: Gallery): Promise<string> =>
  toHttpsUrl(
    await gallery.files[0].resolveUrl(DOWNLOAD_EXTENSION, ThumbnailSize.Big),
  );

/** 갤러리의 모든 페이지 원본 URL입니다. 페이지 순서를 그대로 지킵니다 */
export const resolveImageUrls = (gallery: Gallery): Promise<string[]> =>
  Promise.all(
    gallery.files.map(async (file) =>
      toHttpsUrl(await file.resolveUrl(DOWNLOAD_EXTENSION)),
    ),
  );

/** 폴더명 패턴에 넘길 재료만 추립니다 */
export const toDownloadNameSource = (gallery: Gallery): DownloadNameSource => ({
  id: gallery.id,
  title: { display: gallery.title.display },
  type: gallery.type,
  languageName: gallery.language ? { english: gallery.language.name } : null,
  artists: toNames(gallery.artists),
  groups: toNames(gallery.groups),
  series: toNames(gallery.series),
  characters: toNames(gallery.characters),
});

/** 렌더러로 보낼 모양으로 바꿉니다 */
export const toGalleryDto = async (gallery: Gallery): Promise<GalleryDto> => ({
  id: gallery.id,
  title: { display: gallery.title.display },
  type: gallery.type,
  languageName: gallery.language
    ? { english: gallery.language.name, local: gallery.language.localName }
    : null,
  artists: toNames(gallery.artists),
  groups: toNames(gallery.groups),
  series: toNames(gallery.series),
  characters: toNames(gallery.characters),
  tags: gallery.tags.map((tag) => ({ type: tag.type, name: tag.name })),
  pageCount: gallery.files.length,
  releaseDate: gallery.publishedDate ?? gallery.addedDate,
  thumbnailUrl: await resolveThumbnailUrl(gallery),
});

/**
 * Hitomi-Downloader 형식의 info.txt 내용을 만듭니다.
 *
 * 다운로드와 info.txt 일괄 생성이 반드시 같은 텍스트를 내야 합니다. 이 파일은
 * 라이브러리 스캔에서 다시 파싱되므로, 항목 이름과 줄 간격을 바꾸면
 * infoTxtParser도 함께 봐야 합니다.
 */
export const buildInfoContent = (gallery: Gallery): string =>
  [
    `갤러리 넘버: ${gallery.id}`,
    `제목: ${gallery.title.display}`,
    `작가: ${toNames(gallery.artists).join(", ") || "N/A"}`,
    `그룹: ${toNames(gallery.groups).join(", ") || "N/A"}`,
    `타입: ${gallery.type || "N/A"}`,
    `시리즈: ${toNames(gallery.series).join(", ") || "N/A"}`,
    `캐릭터: ${toNames(gallery.characters).join(", ") || "N/A"}`,
    `태그: ${
      gallery.tags
        .map((tag) =>
          tag.type === "male" || tag.type === "female"
            ? `${tag.type}:${tag.name}`
            : tag.name,
        )
        .join(", ") || "N/A"
    }`,
    `언어: ${gallery.language?.name || "N/A"}`,
  ].join("\n\n");
