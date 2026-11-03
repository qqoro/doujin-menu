import { Extension, ThumbnailSize, type Gallery } from "node-hitomi";
import type { GalleryDto } from "../../../types/ipc.js";
import { formatInfoContent } from "../../parsers/infoTxtFormat.js";
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

/** 갤러리를 info.txt 텍스트로 씁니다. 형식은 `formatInfoContent` 한 곳에 있습니다 */
export const buildInfoContent = (gallery: Gallery): string =>
  formatInfoContent({
    hitomi_id: String(gallery.id),
    title: gallery.title.display,
    artists: toNames(gallery.artists),
    groups: toNames(gallery.groups),
    type: gallery.type || null,
    series: toNames(gallery.series),
    characters: toNames(gallery.characters),
    tags: gallery.tags.map((tag) =>
      tag.type === "male" || tag.type === "female"
        ? `${tag.type}:${tag.name}`
        : tag.name,
    ),
    language: gallery.language?.name || null,
  });
