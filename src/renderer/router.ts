import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import Layout from "./components/layout/Layout.vue";
import Downloader from "./components/pages/Downloader.vue";
import Library from "./components/pages/Library.vue";
import Viewer from "./components/pages/Viewer.vue";
import Settings from "./components/pages/Settings.vue";

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
