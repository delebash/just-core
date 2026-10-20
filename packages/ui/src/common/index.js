// SPDX-License-Identifier: MIT
// The common layer of @delebash/ui (packages/ui/src/common/) —
// general, app-agnostic UI primitives shared by ALL Vue apps. Token-driven; the
// host app defines the design tokens (this layer ships safe fallbacks). When this
// graduates to its own package, this folder moves out wholesale — nothing here
// may import from ../ (the llm layer).
import "./styles.css";

export { default as UiButton } from "./components/UiButton.vue";
export { default as UiInput } from "./components/UiInput.vue";
export { default as UiDate } from "./components/UiDate.vue";
export { default as UiSecretInput } from "./components/UiSecretInput.vue";
export { default as UiTextarea } from "./components/UiTextarea.vue";
export { default as UiCheckbox } from "./components/UiCheckbox.vue";
export { default as UiTag } from "./components/UiTag.vue";
export { default as UiBanner } from "./components/UiBanner.vue";
export { default as UiChip } from "./components/UiChip.vue";
export { default as UiSelect } from "./components/UiSelect.vue";
// Multi-select on Popover+Listbox — born for the i18n target-languages picker,
// generic on purpose (2026-08-02 ruling: new capabilities land in the KIT, never an app).
export { default as UiMultiSelect } from "./components/UiMultiSelect.vue";
export { default as UiNumber } from "./components/UiNumber.vue";
export { default as UiTable } from "./components/UiTable.vue";
// The shared progress bar — was kit-internal only (DownloadBar/QuickSetup), which
// forced consumers to hand-roll their own (found 2026-08-04: two differing local
// bars in one app). Exported so no app ever needs a private progress control.
export { default as UiProgress } from "./components/UiProgress.vue";
export { default as UiColorPicker } from "./components/UiColorPicker.vue";
export { default as UiSegmented } from "./components/UiSegmented.vue";
export { default as UiMenu } from "./components/UiMenu.vue";
export { default as UiMenuItem } from "./components/UiMenuItem.vue";
export { default as UiMenuSeparator } from "./components/UiMenuSeparator.vue";
// THE slider (2026-08-21). There was none, so 14 hand-rolled `<input
// type="range">` grew across the family, each with its own width, its own
// place for the number, and nowhere to say what the ends mean.
export { default as UiSlider } from "./components/UiSlider.vue";
export { default as UiToggle } from "./components/UiToggle.vue";
export { default as UiField } from "./components/UiField.vue";

// shared app-shell components + services (app-agnostic; host provides tokens/router)
export { default as Icon } from "./components/Icon.vue";
export { default as Breadcrumb } from "./components/Breadcrumb.vue";
// The eyebrow+H1 pane header (lifted from JW 2026-08-04 — both apps had invented
// their own). helpKey pins the "?" HelpTrigger far right.
export { default as PaneHeader } from "./components/PaneHeader.vue";
// The Settings chrome — top tab strip + content (the family shape; lifted from JW).
export { default as SettingsShell } from "./components/SettingsShell.vue";
// SettingsShell's strip, on its own — for a view that owns its own scroller and
// would inherit a second one by taking the whole shell.
export { default as UiTabStrip } from "./components/UiTabStrip.vue";
// a strip's tabs wired to the panels the consumer renders (APG Tabs: tabpanel, aria-labelledby)
export { tabPanelAttrs, tabPanelId, tabId } from "./components/tabPanels.js";
// a picture the app's server holds, through the kit's transport (the bearer token, the phone's in-app server)
export { default as UiServerImage } from "./components/UiServerImage.vue";
export { useServerImage } from "./composables/useServerImage.js";
export { promptDialog, confirmDialog, dialogState, _resolveDialog } from "./services/dialog.js";
export { tooltipDirective } from "./services/tooltip.js";

// shared in-app Help system — drawer + "?" trigger + open-state/config + the
// docs markdown renderer. The host supplies the docs content via configureHelp().
export { default as HelpDrawer } from "./components/HelpDrawer.vue";
export { default as HelpTrigger } from "./components/HelpTrigger.vue";
export { configureHelp, openHelp, closeHelp, toggleHelp, helpState, helpConfig } from "./services/help.js";
export { makeDocsHelpAdapter } from "./services/helpDocs.js";
export { renderHelpMarkdown, slugifyHeading } from "./services/helpMarkdown.js";

// shared toasts — the imperative bridge (Quasar's Notify under the hood)
export { pushToast, clearToasts } from "./services/toastBridge.js";
// what a screen reader is told without the focus moving — the one polite and one assertive live
// region every toast and AI task speaks through (installLlmUi creates them at start)
export { announce, clearAnnouncer, installAnnouncer } from "./services/announce.js";

// the error and validation contract (app-structure §15): one way to show a failure, form rules
// from the route's own schema, field errors under their fields, renderer errors into the log
export { attachProblem, parseProblem } from "./services/apiError.js";
export { fieldErrors, fieldMessage, schemaRules, takesNull } from "./services/forms.js";
export { errorMessage, reportError } from "./services/reportError.js";
export { installErrorReporting } from "./services/errorReporting.js";

// shared external-link opener — kit anchors route clicks through openExternal;
// the host wires its shell's openers via configureExternal (services/native.js).
// openPath/canOpenPath are the same seam for LOCAL folders ("Open folder").
export { configureExternal, openExternal, openPath, canOpenPath, isDesktopShell } from "./services/external.js";
export { shellMenuLabels, shellTrayLabels } from "./services/shellMenu.js";

// THE one door for putting a file on the user's disk — native dialog when the
// host wired one, browser download otherwise. Every export in every app.
export { configureFileSave, saveBlob, saveUrlAs, downloadBlob, canSaveNatively } from "./services/fileSave.js";

// the Lab test-data registry (§7.3 + QC-35) — the host registers its listable
// material (JW: chapters/characters) AND a per-action affordance declaration
// map (pickers / "From this book" compose / applicable sample labels)
export { configureTestData, testDataSources, testDataAction, mergeVariables } from "./services/testData.js";

// shared empty-state placeholder
export { default as EmptyState } from "./components/EmptyState.vue";

// shared modal shell (Quasar's QDialog; self-contained token-driven styles) + the
// imperative prompt/confirm host built on it (driven by services/dialog.js)
export { default as AppModal } from "./components/AppModal.vue";
export { default as AppDialog } from "./components/AppDialog.vue";

// shared boot-time "can't reach the server" screen (host passes brand + URL)
export { default as ConnectionError } from "./components/ConnectionError.vue";

// shared server transport — the single fetch layer (host calls
// configureServerApi({ resolveBase, authToken }) once at boot)
export {
  configureServerApi, makeOriginAwareResolver, serverUrl, url, lastError, serverNeedsToken,
  request, get, post, patch, put, del, requestBlob, postForm, safeRequest, checkServer, CHECK_SERVER_MS,
} from "./services/serverApi.js";
// the access token this browser sends its server (the address's `?token=`, or the connection page's)
export { adoptTokenFromAddress, getServerToken, setServerToken } from "./services/serverToken.js";
// where those requests go — the network, or the phone's in-app server (a worker)
export { answerWorkerCalls, inAppServer, serverFetch, setServerTransport, workerFetch } from "./services/transport.js";
// another device's changes landing on the server (sync): the app reloads what it shows
export { replacingData, watchSync } from "./services/syncWatch.js";

// shared appearance/theming engine + catalogs (host calls applyAppearance at boot)
export * from "./services/appearance.js";

// The kit's words in the app's vue-i18n language, for kit code outside a component.
export { kitLocale, kitN, kitT } from "./services/kitI18n.js";

// shared language CODE → readable NAME (Intl.DisplayNames, in the app's vue-i18n language).
// Every app shows language somewhere and each was about to grow its own map;
// `en-US` reads as "American English", not as a code (2026-08-21).
export { languageName, languageOptionsFrom, useLanguageNames } from "./services/languageNames.js";

// shared byte formatter (DL-1) — the ONE size-label formatter, so a disk-usage /
// download surface in either app renders bytes identically.
export { fmtBytes } from "./services/downloadRate.js";

// shared "5m ago" (Intl.RelativeTimeFormat in the app's vue-i18n language) — the ONE time-ago label.
export { relativeTime } from "./services/relativeTime.js";
// a calendar date kept as ISO ("2027-03-01") — UiDate's value — in the app's language
export { dateLabel, isIsoDate, localDate } from "./services/isoDate.js";
export { isolate } from "./services/isolate.js";

// shared composables (host-agnostic; vue-only)
export { useRovingTabindex } from "./composables/useRovingTabindex.js";
export { usePanelDismiss, PANEL_TOGGLE_ATTR } from "./composables/usePanelDismiss.js";
export { useModalPopup } from "./composables/useModalPopup.js";
