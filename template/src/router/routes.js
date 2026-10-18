// SPDX-License-Identifier: MIT
// The routes (app-structure §Q.1, §11). The layout is imported, not lazy: every screen needs it, and
// lazily its components' styles moved into a later chunk and won ties with the app's (measured on
// JustVoice). The pages are lazy. /ai and /settings/:section? are the family chrome; /offline is
// outside the layout (the boot file sends every route there while the server is down).
import MainLayout from "../layouts/MainLayout.vue";

const pages = [
  { path: "", component: () => import("../pages/HomePage.vue") },
  { path: "notes", component: () => import("../pages/NotesPage.vue") },
  { path: "ai", component: () => import("../pages/AiPage.vue") },
  { path: "settings/:section?", component: () => import("../pages/SettingsPage.vue"), props: true },
  // anything else, inside the chrome, so the nav still works
  { path: ":catchAll(.*)*", component: () => import("../pages/NotFoundPage.vue") },
];

export default [
  { path: "/", component: MainLayout, children: pages },
  { path: "/offline", component: () => import("../pages/ConnectionErrorPage.vue") },
];
