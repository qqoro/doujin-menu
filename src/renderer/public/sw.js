// 홈 화면에 추가(PWA 설치) 조건을 맞추고, PC 앱이 꺼져 있을 때 보여 줄 안내 페이지 하나만 캐시한다.
// 데이터는 PC에 있으므로 그 밖의 오프라인 캐시는 하지 않는다.
const CACHE = "offline-v1";
const OFFLINE_ASSETS = ["./offline.html", "./pwa/icon-192.png"];
// tailscale serve/Funnel은 PC 앱이 꺼져 있으면 502를 돌려준다
const UNAVAILABLE = new Set([502, 503, 504]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const offlinePage = () => caches.match("./offline.html");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) =>
          UNAVAILABLE.has(response.status) ? offlinePage() : response,
        )
        .catch(offlinePage),
    );
    return;
  }
  // 안내 페이지의 아이콘은 PC가 꺼져 있어도 나와야 한다
  if (new URL(request.url).pathname.endsWith("/pwa/icon-192.png")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
