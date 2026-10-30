<!-- SPDX-License-Identifier: MIT -->
<script setup>
// Shared breadcrumb trail. Each segment is { label, to?, onClick? }: a segment
// with a `to` route or an `onClick` handler is clickable; the trailing (current)
// segment usually omits both and renders as plain text. App-agnostic (uses
// vue-router, which every app on the stack ships). Supersedes the per-app forks.
import { useRouter } from "vue-router";

defineProps({
  segments: { type: Array, required: true },
});

const router = useRouter();
function activate(seg) {
  if (typeof seg.onClick === "function") seg.onClick();
  else if (seg.to) router.push(seg.to);
}
</script>

<template>
  <nav class="breadcrumb">
    <template v-for="(seg, i) in segments" :key="i">
      <button v-if="seg.to || seg.onClick" type="button" class="breadcrumb-link" @click="activate(seg)">{{ seg.label }}</button>
      <span v-else class="breadcrumb-current">{{ seg.label }}</span>
      <span v-if="i < segments.length - 1" class="breadcrumb-sep" aria-hidden="true">·</span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: max(var(--text-floor, 0px), 10.5px); font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted);
}
/* a 24 px hit box (WCAG 2.5.8 — the link's text is 15.8 px tall), its padding taken back by an equal negative margin:
   nothing on screen moves (JustWrite's axe run, 2026-10-29) */
.breadcrumb-link {
  appearance: none; background: none; border: 0; padding: 4.5px 0; margin: -4.5px 0; cursor: pointer;
  /* above its neighbours, so the padded box isn't covered (axe: "partially obscured" — JustWrite, 2026-10-29) */
  position: relative; z-index: 1;
  font: inherit; letter-spacing: inherit; text-transform: inherit;
  color: var(--muted);
}
.breadcrumb-link:hover { color: var(--accent); text-decoration: underline; }
.breadcrumb-current { color: var(--muted); }
.breadcrumb-sep { color: var(--border-strong); }
</style>
