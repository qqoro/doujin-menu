import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import electronLog from "electron-log";
import Layout from "./components/layout/Layout.vue";
import Downloader from "./components/pages/Downloader.vue";
import Library from "./components/pages/Library.vue";
import Settings from "./components/pages/Settings.vue";
import Viewer from "./components/pages/Viewer.vue";
import { IS_REMOTE } from "./lib/runtime";

// 휴대폰 브라우저에는 electron-log를 받아 줄 메인 프로세스 연결이 없다
const log = IS_REMOTE ? console : electronLog;

log.log("[Router] 모듈 로드 시작");

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/library",
    component: Layout,
    children: [
      {
        path: "/library",
        name: "Library",
        component: Library,
      },
      {
        path: "/downloader",
        name: "Downloader",
        component: Downloader,
      },
      {
        path: "/settings",
        name: "Settings",
        component: Settings,
      },
      {
        path: "/statistics",
        name: "Statistics",
        component: () => import("./components/pages/Statistics.vue"),
      },
      // 연결 코드와 기기 관리는 PC에서만 한다
      ...(IS_REMOTE
        ? [{ path: "/mobile", redirect: "/library" }]
        : [
            {
              path: "/mobile",
              name: "Mobile",
              component: () => import("./components/pages/Mobile.vue"),
            },
          ]),
      {
        path: "/history",
        name: "History",
        component: () => import("./components/pages/History.vue"),
      },
      {
        path: "/series-manager",
        name: "SeriesManager",
        component: () => import("./components/pages/SeriesManager.vue"),
      },
      {
        path: "/browse",
        name: "Browse",
        component: () => import("./components/pages/Browse.vue"),
      },
      {
        path: "/duplicates",
        name: "Duplicates",
        component: () => import("./components/pages/Duplicates.vue"),
      },
    ],
  },
  {
    path: "/viewer/:id",
    name: "Viewer",
    component: Viewer,
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

log.log("[Router] 라우터 생성 완료");

router.beforeEach((to, from, next) => {
  log.log(`[Router] beforeEach: ${from.path} → ${to.path}`);
  next();
});

router.afterEach((to) => {
  log.log(`[Router] afterEach: ${to.path} 이동 완료`);
});
