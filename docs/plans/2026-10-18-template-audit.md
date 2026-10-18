<!-- SPDX-License-Identifier: MIT -->
# The template against the family standards — audit of 2026-10-18

Why: on just-house-paint the user found two family standards the template never carried — the AI
progress bar (§8, prose only) and the hue slider's colour (CSS only JustVoice had): "this is the whole
point of the template, to make sure every app is the same". This audit looks for the next ones.

How: a read-only research agent read all of `app-structure.md` (§Q.1–§18) and the whole guard, and
checked `template/`, its tests and just-house-paint, classifying each checkable standard as A (kit code
apps get automatically), B (template code — tested or not) or C (prose only / one older app only).
Agent report, verbatim below (unverified points are marked as such by the agent). Fixes are tracked
in `docs/dev/TASKS.md` ("The template audit").

---

The guard runs clean today (0 violations), and house-paint's `i18n:lint` gives 0.

## Class C and untested class B items, most user-visible first

| Standard · § | Where it lives today | What a generated app lacks | How to make it real |
|---|---|---|---|
| **The Appearance font picker** · §11 Appearance (`UI_FONTS`) | Font files ship only in JustWrite (16 `@fontsource/*` packages, `src/css/fonts.css`) and JustVoice (Inter only) | The template, docgen and house-paint ship no fonts, and their CSP is `font-src 'self' data:`. Picking any of the 8 fonts changes nothing, and the default `uiFont: "Geist"` (kit `appearance.js:186`) quietly falls back to the system font | Kit code: `@font-face` for `UI_FONTS` in the kit's stylesheet, or trim the list to what ships. Plus a guard check |
| **The AI status button's look** · §4/§11 | `AiStatusButton.vue:9-11` leaves its chrome to the host, and only JustWrite supplies it (`justwrite-app/src/css/app.scss:99`) | A browser-default boxed button at top right (`template/e2e/shots/home.png`, `ai.png`) | Kit code: give `.ai-status-btn` the same reset `.iconbtn` has |
| **Self-update** · §Q.2 `updates`, release workflow | JustWrite and JustVoice only (`releasesUrl` + `.github/workflows/release.yml`) | Settings → Updates shows the version and notes but never offers an update | Template code: `release.yml`, with `updates` filled in by `new-app.js` |
| **The phone** · §Q.7 in-app server, §Q.1 phone drawer | Server worker only in JustWrite; phone-width drawer only in JustWrite and JustVoice | The template keeps `src-capacitor/` and `build:android`, and /new-just-app offers "Phone app: yes", but a phone build has no server (every route ends on `/offline`); the drawer is `behavior="desktop"` (`MainLayout.vue:78`) | Template code + test, or the skill stops offering the phone. Guard: if `src-capacitor/` exists, `src/phone/boot.js` and `server/src/phone.js` must too |
| **Dates and numbers in the app's language** · §Q.11 | Prose only | house-paint `ColorsPage.vue:149` uses `toLocaleString()`; kit `logLines.js:24,50` uses `Intl.DateTimeFormat(undefined…)` | Guard: grep for `toLocale*String()` and `Intl.*Format(undefined` |
| **Empty state = EmptyState with its one action** · §17 | Template B, tested in `NotesPage.test.js`; no guard check | Nothing stops hand-rolled `<p>` empties | Review item; widen the e2e contract scan from `src/pages` to `src/components` |
| **A schema for upload routes** · §15 | No template example for multipart or binary bodies | house-paint checks them by hand: `houses_api.js:43`, `paints_api.js:103`, `parts_api.js:76` (limits unverified) | Kit helper (form/binary limits) + a template example |
| **Help on a failed warm start** · §11 `BootModelLoad #failed` | JustVoice only (`MainLayout.vue:722`) | Only the bar's error and Retry | Kit default content for the slot |
| Connection-error page and `/offline` redirect · §Q.4 | Template B, **no test** (JustWrite and JustVoice have `ConnectionErrorPage.test.js`) | — | Template test |
| Tray listeners and keep-running re-applied at boot · §11 | Template B (`MainLayout.vue:46-60`), **no test** | — | Template test |
| Settings → Storage, Server, About · §11 | Template copies, **no test**; guard advisory: 84–96% shared with house-paint | — | Kit components (the §11 "kit grows" rule) |
| Boot wiring: `installErrorReporting`, the `tooltip` directive, `configureHelp` · §15, §12 | Template boot B; nothing asserts them | — | Guard: the boot file calls each |
| `LlmUiHosts`, `HelpDrawer`, `AiStatusButton`, `SettingsShell`, `AiModelsArea` mounted · §4, §11 | Template B; e2e covers part; the guard names them only in comments | — | Guard check for each mount |
| Each `help-key` has a `docs/<slug>.md` · §14 | Untested | — | Guard check |
| The once-ever AI offer has a call site · §11 | Its only caller is the example page (`NotesPage.vue:77`) | An app that replaces Notes loses the offer silently | Guard: `maybeOfferAiSetup(` called outside `stores/ui.js` |
| No literal px or colours; no raw `q-*` tags · §17, §Q.4 | The contract test scans only inline styles, only in `src/pages` | — | Widen the scan |

## Kit components that need app-side code

- **`LuCombobox.vue:74` (kit bug):** its Fetch button uses `lu-btn lu-btn--secondary lu-btn--small`, which nothing defines — a native button in AI Settings → the provider form (`ProviderForm.vue:376,390`), in every app.
- **`AiStatusButton.vue:9-11`:** its chrome is the host's; only JustWrite provides it.
- **`TitleBar.vue:11-12,39-52`:** its look comes from the app's `.titlebar`, `.titlebar__title`, `.iconbtn` (template `app.scss:20-33`).
- **`UiMenu.vue:26-27`:** the trigger has no style unless the caller passes the `ui-btn` classes.
- **Fonts:** `appearance.js:39` ("families the host loads") and `common/styles.css:9-14` (font tokens the host must map).
- **`HelpTrigger.vue:14`:** needs the host to register `v-tooltip` globally (`AiStatusButton` too).
- **`useAiTasksNav.js:4`:** the app styles its own nav row.
- **`BootModelLoad.vue:11,59`:** the host owns and skins the splash.
- **`AiModelsArea.vue:998`:** the host wraps it in its own card.
- **Need host wiring:** `UpdatesPanel.vue:4-5`, `LogsPanel.vue:10`, `DataManagement.vue:3-5`, `ConnectionError.vue:5-6`, `HelpDrawer.vue:3-8`, `AiSetupOffer.vue:6-7`.
- **Stale comment:** `UiMenuItem.vue:8` says the item's look is the host's; the kit now styles it.

## Things the template references that are missing

- `template/AGENTS.md:82` and `just-house-paint/AGENTS.md:89`: the family-rules copy links `app-structure.md` and `../template/`, which lead nowhere from an app.
- `template/.gitignore:30-31` ignores `/src/phone/worker-bundle`, but the template has no `src/phone`.
- §11 says "the four `tray:*` listeners", but the kit shell emits three (`main.js:472,479,494`).

## Gaps confirmed in just-house-paint

- The AI status button shows as a native box (no `.ai-status-btn` rule in `src/css/app.scss`).
- The font picker does nothing (no font files; `index.html` has `font-src 'self' data:`).
- The provider form's Fetch button is unstyled (the kit's `LuCombobox` bug).
- `SchemesTab.vue:90`: "No paint colors… Add a brand's colors first." with no button — a dead end.
- `DesignsTab.vue:76,99`: hand-rolled `<p>` empty states, not EmptyState.
- `ColorsPage.vue:149`: `toLocaleString()` uses the browser's language.
- `ColorsTab.vue:235`: `font-size: 11px`.
- `ColorsTab.vue:130` and `PartsTab.vue:69`: raw `<q-btn>`.
- No self-update (no `updates` in `src-electron/electron-main.js`, no `.github/workflows`).
- Phone: `src-capacitor/` is present but can't work (its PRD puts the phone out of scope).

Checked and fine in house-paint: Settings has its 9 sections, the family's seven in canon order; every
`help-key` has its doc and `toc.json` matches; every AI task shows a strip where it starts; triggers
disable while their task runs; a polled job's percent reaches the strip; `installErrorReporting` is
called in boot; `i18n:lint` gives 0.

Unverified: the app's real window (code and the template's screenshots only), and whether house-paint's
upload routes enforce size or type limits.
