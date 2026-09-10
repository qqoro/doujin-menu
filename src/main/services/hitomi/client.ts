import { Hitomi } from "node-hitomi";

/**
 * 앱이 공유하는 히토미 클라이언트입니다.
 *
 * imageContextMaximumAge를 기본값(1시간)보다 짧게 잡습니다. 원본 이미지 URL의
 * 서브도메인과 경로는 히토미가 주기적으로 갈아치우는 gg.js에서 나오는데,
 * 캐시가 만료되기 전까지는 죽은 값으로 URL을 계속 만들어 냅니다. 즉 캐시 수명이
 * 그대로 다운로드 장애 시간이 됩니다.
 *
 * 썸네일 URL은 이 컨텍스트를 타지 않으므로, 짧게 잡아도 gg.js 요청은 실제
 * 다운로드가 시작될 때만 나갑니다.
 *
 * 테스트는 이 모듈을 모킹합니다. 핸들러가 node-hitomi를 직접 import하지 않도록
 * 하는 것도 이 파일의 역할입니다.
 */
export const hitomi = new Hitomi({ imageContextMaximumAge: 30_000 });
