<script setup>
// SPDX-License-Identifier: MIT
// The app's chrome — Quasar's layout as its CLI creates it (app-structure §Q.1), carrying the
// standard chrome every family app has (§11; docgen's layouts/MainLayout.vue is the donor):
//   - the title bar (components/TitleBar.vue — the kit's frame, the mode cycler, AiStatusButton);
//   - the nav in the drawer: Home and Notes, then the kit's "AI Settings" / "App Settings", then
//     the "AI tasks" row, which spreads the kit's navAttrs (its data-panel-toggle keeps the panel
//     from closing on the very click that opens it) — Quasar's QList/QItem, so the rows are
//     Quasar's own links;
//   - the one content scroller (pages flow in it: pageFlow);
//   - <LlmUiHosts/> (the kit's dialogs, toasts and panels — with one missing, a confirm never
//     answers), <HelpDrawer/>, the once-ever AI offer;
//   - the warm-start splash: this app's plate (the same image as index.html's), the kit's
//     <BootModelLoad/> inside it, shown while the kit's `warmModelId` is set;
//   - the tray's renderer half (Open settings, About, Copy server URL) and keep-running, re-applied
//     to the shell every start (the shell forgets it per launch).
// Family rules: a height:100% chain (never 100vh), one scroller per area.
import { AiSetupOffer, BootModelLoad, HelpDrawer, Icon, LlmUiHosts, pushToast, useAiTasksNav, warmModelId } from "@delebash/ui";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import splashPlate from "../assets/splash-plate.svg";
import TitleBar from "../components/TitleBar.vue";
import { onShellEvent, setKeepRunning } from "../services/native.js";
import { useUiStore } from "../stores/ui.js";

const { t } = useI18n();
const ui = useUiStore();
const router = useRouter();

// The app's pages, then the family's two (their words are the kit's, `kit.nav.*`, the same in
// every app). Icon names are ids, not words.
const NAV = computed(() => [
  { to: "/", label: t("nav.home"), icon: "Home", exact: true },
  { to: "/notes", label: t("nav.notes"), icon: "Note" },
]);
const TOOLS = computed(() => [
  { to: "/ai", label: t("kit.nav.aiSettings"), icon: "Cpu" },
  { to: "/settings", label: t("kit.nav.appSettings"), icon: "Settings" },
]);
const aiTasksNav = useAiTasksNav();
// The drawer's width, which QDrawer takes in pixels (app.scss .shell__nav fills it).
const NAV_WIDTH = 200;

const unsubscribe = [];
onMounted(() => {
  if (ui.keepServerRunning) setKeepRunning(true);
  unsubscribe.push(
    onShellEvent("tray:open-settings", () => router.push("/settings")),
    onShellEvent("tray:about", () => router.push("/settings/about")),
    onShellEvent("tray:copy-url", async (url) => {
      // A focused window's clipboard write is reliable; the shell shows the window first (§11).
      try {
        await navigator.clipboard.writeText(String(url));
        pushToast({ kind: "success", title: t("tray.urlCopied"), description: String(url) });
      } catch (err) {
        pushToast({ kind: "error", title: t("tray.copyFailed"), description: String(err?.message || err) });
      }
    }),
  );
});
onBeforeUnmount(() => {
  for (const off of unsubscribe.splice(0)) off();
});
</script>

<template>
  <!-- view "hhh lpr fff": the title bar over the full width, the nav under it on the left — neither
       fixed: the layout's root is fixed to the window and never scrolls (the content scroller
       does), and a fixed drawer is a compositing layer of its own (measured on JustWrite,
       2026-10-09). The drawer keeps desktop behaviour at every width: this app has no phone
       layout yet. -->
  <q-layout view="hhh lpr fff" class="shell">
    <q-header>
      <TitleBar />
    </q-header>

    <q-drawer :model-value="true" side="left" behavior="desktop" :width="NAV_WIDTH">
      <nav class="shell__nav">
        <div class="shell__brand">
          <span class="brand-mark">{{ t("app.mark") }}</span>
          <span class="brand-name">{{ t("app.name") }}</span>
        </div>
        <q-list class="shell__links">
          <q-item
            v-for="n in NAV" :key="n.to" :to="n.to" :exact="n.exact"
            class="navlink" active-class="navlink--active" dense
          >
            <q-item-section avatar class="navlink__icon"><Icon :name="n.icon" :size="17" /></q-item-section>
            <q-item-section>{{ n.label }}</q-item-section>
          </q-item>
          <q-separator class="nav-divider" />
          <q-item
            v-for="n in TOOLS" :key="n.to" :to="n.to"
            class="navlink" active-class="navlink--active" dense
          >
            <q-item-section avatar class="navlink__icon"><Icon :name="n.icon" :size="17" /></q-item-section>
            <q-item-section>{{ n.label }}</q-item-section>
          </q-item>
          <!-- v-bind="navAttrs" carries `data-panel-toggle` (the kit's useAiTasksNav): without it the
               click that opens the panel is also its outside-click, and it shuts at once. -->
          <q-item
            clickable dense class="navlink navlink--tasks" :active="aiTasksNav.isOpen.value"
            active-class="navlink--active" v-bind="aiTasksNav.navAttrs" @click="aiTasksNav.toggle"
          >
            <q-item-section avatar class="navlink__icon"><Icon name="Sparkle" :size="17" /></q-item-section>
            <q-item-section>{{ t("kit.nav.aiTasks") }}</q-item-section>
            <q-item-section v-if="aiTasksNav.badge.value" side>
              <q-badge class="nav-count" :class="{ 'nav-count--error': aiTasksNav.hasErrors.value }">
                {{ aiTasksNav.badge.value }}
              </q-badge>
            </q-item-section>
          </q-item>
        </q-list>
      </nav>
    </q-drawer>

    <q-page-container>
      <div class="shell__main">
        <router-view />
      </div>
    </q-page-container>

    <LlmUiHosts />
    <HelpDrawer />
    <!-- The once-ever AI offer (ruling R3): opened by the first note's save on a machine with no
         default AI provider; the flag is kept whatever the user picks. -->
    <AiSetupOffer
      v-if="ui.aiOfferOpen" :app-name="t('app.name')"
      @close="ui.closeAiOffer()"
      @quick-setup="router.push('/ai?quicksetup=1')"
      @connect-provider="router.push('/ai?providers=online')"
    />

    <!-- The warm-start splash — this app's plate (keep the image and its fit in step with
         index.html's #app-boot), the kit's load group inside it. -->
    <div v-if="warmModelId" class="splash">
      <img class="splash__plate" :src="splashPlate" alt="" />
      <div class="splash__strip">
        <BootModelLoad />
      </div>
    </div>
  </q-layout>
</template>
