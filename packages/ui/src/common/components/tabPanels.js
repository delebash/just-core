// SPDX-License-Identifier: MIT
// A tab strip's tabs wired to their panels — the WAI-ARIA APG Tabs pattern
// (w3.org/WAI/ARIA/apg/patterns/tabs/): each tab (role="tab", QTab's own) names the panel it shows
// (aria-controls), and each panel is role="tabpanel", named by its tab (aria-labelledby) and a tab
// stop of its own (tabindex 0 — Reka UI's TabsContent does the same), so the keyboard reaches a
// panel's text and scrolls it. UiTabStrip takes the same `idPrefix` and gives its tabs the ids
// these point at; the consumer renders the panels (one at a time, as SettingsShell, or all of
// them with v-show, as the AI page).
//
//   <UiTabStrip v-model="tab" :tabs="tabs" id-prefix="settings" :aria-label="…" />
//   <div v-bind="tabPanelAttrs('settings', tab)">…</div>

/** The id of the tab `id` in the strip `prefix`. */
export const tabId = (prefix, id) => `${prefix}-tab-${id}`;

/** The id of the panel the tab `id` shows. */
export const tabPanelId = (prefix, id) => `${prefix}-panel-${id}`;

/** A panel's attributes: its id, role="tabpanel", named by its tab, a tab stop. */
export function tabPanelAttrs(prefix, id) {
  return { id: tabPanelId(prefix, id), role: "tabpanel", "aria-labelledby": tabId(prefix, id), tabindex: "0" };
}
