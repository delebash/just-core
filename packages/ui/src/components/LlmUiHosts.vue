<script setup>
// SPDX-License-Identifier: MIT
// Every host element the shared UI needs mounted, as ONE tag in the app shell.
//
// These are not decorative. `confirmDialog()` resolves through whatever renders
// `<AppDialog />`; with no host mounted its promise never settles, so a confirmed
// action is a button that does nothing at all — measured in just_ai_i18n_docgen on
// 2026-08-03, where Change folder, Clear models cache, Clear spawn logs and Apply-all
// were ALL dead, under a green suite (the smoke test asserted the panel's strings,
// which is exactly what presence-testing cannot catch).
//
// One tag rather than a list, because the failure mode was mounting SOME of them.
//
// The global AI task stack rides here for the same reason (2026-10-18): a screen that forgot its
// in-place progress strip left an AI task with no visible progress (just-house-paint's house page,
// found by the user). Mounted with the hosts, every app shows every running task. An app whose
// user decided its pages show only their own tasks, with the header's ✨ AI button the one place
// that shows them all (JustVoice, 2026-10-05), passes `:task-stack="false"`.
// (The toasts need no host since they moved to Quasar's Notify, which mounts its own —
// every app lists Notify in its quasar.config.js plugins.)
import AppDialog from "../common/components/AppDialog.vue";
import AiTaskStack from "./AiTaskStack.vue";

defineProps({ taskStack: { type: Boolean, default: true } });
</script>

<template>
  <AppDialog />
  <AiTaskStack v-if="taskStack" />
</template>
