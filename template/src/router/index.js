// SPDX-License-Identifier: MIT
// Vue Router as Quasar's CLI creates it — the history from quasar.config.js (`build.vueRouterMode`,
// always 'hash': the desktop window's app:// pages and the headless server's static files have no
// real paths) — as ONE instance: Quasar installs the default export, and code that navigates
// imports `router`.
import { defineRouter } from "#q-app";
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import routes from "./routes.js";

const createHistory = import.meta.env.QUASAR_SERVER
  ? createMemoryHistory
  : import.meta.env.QUASAR_VUE_ROUTER_MODE === "history"
    ? createWebHistory
    : createWebHashHistory;

export const router = createRouter({
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,
  history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
});

export default defineRouter(() => router);
