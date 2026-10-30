// SPDX-License-Identifier: MIT
// Shared appearance / theming engine. `applyAppearance(config, { extraApply })`
// owns colour-mode resolution (incl. the system-preference listener) plus all
// the GENERIC design-token overrides the user drives from Settings → Appearance:
// accent + gold hue, functional (danger/success/info) hues, UI/display/mono
// fonts, button knobs, per-area background tints, ink (text) palettes, UI size
// scale, and sidebar nav typography. App-specific tokens (e.g. JustWrite's
// manuscript-editor vars) are applied via the optional `extraApply` hook, so the
// engine stays app-agnostic. Catalogs (fonts/tints/ink/presets/button options)
// are exported so each app's Settings UI renders the same curated options.
// Supersedes the per-app services/appearance.js engines (JV minimal; JW full).
//
// The catalogs' display words are the kit's (kit.appearance.*): each entry's `label` / `name`
// is a catalog key the entry carries as `labelKey` (kit.appearance.*) — the component that shows
// it translates it, so it follows the app's language — while the values a setting stores (ids,
// hues, scales) never change with the language. Font names are names, not words, and are also the
// stored value — they stay as written.

/** `entry` plus the catalog key of its words, kit.appearance.<key>. */
function labelled(key, entry) {
  return { ...entry, labelKey: `kit.appearance.${key}` };
}

const mql = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

let lastResolvedMode = "light";
let systemListener = null;
let lastApplied = null;
let lastOpts = null;

function resolveMode(mode) {
  if (mode === "dark" || mode === "light") return mode;
  return mql?.matches ? "dark" : "light";
}

// ── Curated fonts ────────────────────────────────────────────────────
// Stacks reference families the host loads in index.html.
export const UI_FONTS = [
  { label: "Inter",                 stack: '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  { label: "Spline Sans",           stack: '"Spline Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Geist",                 stack: '"Geist", ui-sans-serif, system-ui, sans-serif' },
  { label: "Hanken Grotesk",        stack: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif' },
  { label: "Albert Sans",           stack: '"Albert Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Manrope",               stack: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { label: "DM Sans",               stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif' },
];

export const DISPLAY_FONTS = [
  { label: "Fraunces",          stack: '"Fraunces", Georgia, "Times New Roman", serif' },
  { label: "Source Serif 4",    stack: '"Source Serif 4", Georgia, serif' },
  { label: "Newsreader",        stack: '"Newsreader", Georgia, serif' },
  { label: "Libre Caslon Text", stack: '"Libre Caslon Text", Georgia, serif' },
  { label: "Playfair Display",  stack: '"Playfair Display", Georgia, serif' },
  { label: "EB Garamond",       stack: '"EB Garamond", Garamond, Georgia, serif' },
  { label: "Spectral",          stack: '"Spectral", Georgia, serif' },
];

export function uiStack(label) {
  return (UI_FONTS.find((f) => f.label === label) || UI_FONTS[0]).stack;
}
export function displayStack(label) {
  return (DISPLAY_FONTS.find((f) => f.label === label) || DISPLAY_FONTS[0]).stack;
}

// ── Font pairings (UI + display together) ────────────────────────────
export const PAIRINGS = [
  labelled("pairing.finePress", { id: "fine-press", ui: "Spline Sans",    display: "Fraunces" }),
  labelled("pairing.calm",      { id: "calm",       ui: "Geist",          display: "Source Serif 4" }),
  labelled("pairing.editorial", { id: "editorial",  ui: "Hanken Grotesk", display: "Newsreader" }),
  labelled("pairing.classic",   { id: "classic",    ui: "Albert Sans",    display: "Libre Caslon Text" }),
];

// ── Surface tints (app + sidebar backgrounds) ────────────────────────
// `neutral` defers to the theme's own --surface-2 so the default is a no-op and
// stays mode-aware; the rest are explicit per-mode colours.
export const SURFACE_TINTS = {
  neutral:    labelled("tint.neutral",    { var: "var(--surface-2)" }),
  ivory:      labelled("tint.ivory",      { light: "#f1ead9", dark: "#211d16" }),
  paperwhite: labelled("tint.paperwhite", { light: "#ffffff", dark: "#262320" }),
  cool:       labelled("tint.cool",       { light: "#eceef1", dark: "#191b1f" }),
  slate:      labelled("tint.slate",      { light: "#e8e9ec", dark: "#16181d" }),
};

// Resolve a tint *value* — a key into `table` OR a literal `#hex` custom colour —
// to the colour for the current mode.
export function resolveTint(value, table, mode) {
  if (typeof value === "string" && value.startsWith("#")) return value;
  const t = (table?.[value]) || (table && (table.neutral || table.match)) || null;
  if (!t) return "";
  if (t.var) return t.var;
  return mode === "dark" ? t.dark : t.light;
}

// ── Ink (text) colour palettes ───────────────────────────────────────
// "auto" leaves the tokens.css defaults; every other palette sets --ink/--ink-2/
// --muted/--subtle together so the four text shades stay a consistent family.
// --muted (the third) is 4.5:1 or more (WCAG 2 AA) on every ground the family paints text on, in its
// mode: each app's surfaces, the soft accent tints at every hue, the surface tints above
// (tests/ink_palettes.test.js measures it); --ink-2 stays darker than it (soft's was raised for that).
export const INK_PALETTES = {
  auto:    labelled("ink.auto",    { auto: true }),
  warm:    labelled("ink.warm",    { light: ["#221f18","#534c3d","#6d644b","#aaa089"], dark: ["#f0e9d8","#c9c0aa","#a1977c","#6f6753"] }),
  neutral: labelled("ink.neutral", { light: ["#1c1c1f","#4a4a4f","#646468","#a8a8ad"], dark: ["#ededed","#c5c5c8","#97979d","#66666b"] }),
  cool:    labelled("ink.cool",    { light: ["#1a1d22","#474c54","#5e6570","#a5acb6"], dark: ["#e8eef2","#c3cbd3","#8e99a6","#5e6976"] }),
  sepia:   labelled("ink.sepia",   { light: ["#3a2c20","#685440","#786147","#b69e83"], dark: ["#efe2ce","#c7b696","#a59674","#6b5d40"] }),
  soft:    labelled("ink.soft",    { light: ["#3a3a3a","#585858","#656565","#b8b8b8"], dark: ["#dcdcdc","#b5b5b5","#979797","#666666"] }),
};

// ── UI size scale ────────────────────────────────────────────────────
// Applied as CSS `zoom` on <html> (Chromium, the Electron window's engine), scaling every
// px/em together.
export const UI_SCALES = [
  labelled("scale.compact",     { value: 0.9 }),
  labelled("scale.snug",        { value: 0.95 }),
  labelled("scale.normal",      { value: 1 }),
  labelled("scale.comfortable", { value: 1.05 }),
  labelled("scale.large",       { value: 1.1 }),
];

// ── Sidebar section heading typography ───────────────────────────────
export const SIDEBAR_HEADING_STYLES = {
  eyebrow: labelled("style.eyebrow",   { font: "var(--font-ui)",    weight: 600, italic: "normal", transform: "uppercase", spacing: "0.1em" }),
  mono:    labelled("style.mono",      { font: "var(--font-mono)",  weight: 500, italic: "normal", transform: "uppercase", spacing: "0.18em" }),
  display: labelled("style.editorial", { font: "var(--font-serif)", weight: 500, italic: "italic", transform: "none",      spacing: "0" }),
  plain:   labelled("style.plain",     { font: "var(--font-ui)",    weight: 600, italic: "normal", transform: "none",      spacing: "0" }),
};

export const SIDEBAR_HEADING_SIZES = [
  labelled("size.xs", { value: "xs", px: "9px" }),
  labelled("size.s",  { value: "s",  px: "10px" }),
  labelled("size.m",  { value: "m",  px: "12px" }),
  labelled("size.l",  { value: "l",  px: "14px" }),
];

// ── Sidebar menu items ───────────────────────────────────────────────
export const NAV_ITEM_STYLES = {
  standard:  labelled("style.standard",  { font: "var(--font-ui)",    weight: 400, activeWeight: 500, italic: "normal", spacing: "0" }),
  bold:      labelled("style.bold",      { font: "var(--font-ui)",    weight: 600, activeWeight: 700, italic: "normal", spacing: "0" }),
  editorial: labelled("style.editorial", { font: "var(--font-serif)", weight: 400, activeWeight: 500, italic: "normal", spacing: "0" }),
  mono:      labelled("style.mono",      { font: "var(--font-mono)",  weight: 400, activeWeight: 500, italic: "normal", spacing: "0.02em" }),
};

export const NAV_ITEM_SIZES = [
  labelled("size.xs", { value: "xs", px: "11.5px" }),
  labelled("size.s",  { value: "s",  px: "12.5px" }),
  labelled("size.m",  { value: "m",  px: "14px" }),
  labelled("size.l",  { value: "l",  px: "15.5px" }),
];

// ── Accent / gold / functional hue presets ───────────────────────────
// A hue preset: its colour name at kit.appearance.color.<name>.
const hue = (h, name) => labelled(`color.${name}`, { hue: h });
export const ACCENT_PRESETS = [
  hue(14, "oxblood"), hue(200, "teal"), hue(25, "rose"),
  hue(75, "amber"), hue(120, "olive"), hue(270, "indigo"),
  hue(320, "plum"), hue(155, "green"),
];
export const GOLD_PRESETS = [
  hue(80, "gold"), hue(55, "brass"), hue(45, "bronze"),
  hue(35, "copper"), hue(155, "sage"), hue(140, "verdigris"),
  hue(235, "slate"), hue(340, "mauve"),
];
export const FUNCTIONAL_PRESETS = {
  success: [hue(150, "green"), hue(165, "emerald"), hue(130, "moss"), hue(185, "teal")],
  danger:  [hue(35, "red"), hue(20, "crimson"), hue(45, "rust"), hue(10, "ruby")],
  info:    [hue(220, "blue"), hue(235, "sky"), hue(260, "indigo"), hue(200, "cyan")],
};

// ── Button knobs ─────────────────────────────────────────────────────
const BUTTON_RADIUS_PX = { sharp: "2px", standard: "6px", rounded: "10px", pill: "999px" };
const BUTTON_DENSITY = {
  compact: { padY: "5px", padX: "12px", padYSm: "3px", padXSm: "8px",  fontSize: "13px", fontSizeSm: "11.5px" },
  comfy:   { padY: "8px", padX: "16px", padYSm: "4px", padXSm: "11px", fontSize: "14px", fontSizeSm: "12px"   },
};
export const BUTTON_RADIUS_OPTIONS = ["sharp", "standard", "rounded", "pill"]
  .map((value) => labelled(`radius.${value}`, { value }));
export const BUTTON_DENSITY_OPTIONS = ["compact", "comfy"]
  .map((value) => labelled(`density.${value}`, { value }));
export const BUTTON_LABEL_CASE_OPTIONS = ["default", "uppercase"]
  .map((value) => labelled(`labelCase.${value}`, { value }));

// Generic defaults — each app spreads its own brand values + extras on top.
export const DEFAULT_APPEARANCE = {
  mode: "system",
  fontPairing: "calm",
  uiFont: "Geist",
  displayFont: "Source Serif 4",
  accentHue: 200,
  goldHue: 80,
  dangerHue: 35,
  successHue: 150,
  infoHue: 220,
  appBg: "neutral",
  sidebarBg: "neutral",
  inkPalette: "auto",
  uiScale: 1,
  sidebarHeadingStyle: "eyebrow",
  sidebarHeadingSize: "s",
  navItemStyle: "standard",
  navItemSize: "s",
  btnRadius: "standard",
  btnDensity: "comfy",
  btnLabelCase: "default",
};

// Fold a persisted (possibly legacy-shape) ui blob into an appearance object.
// `defaults` is the app's full default (generic + its extras).
export function migrateAppearance(persisted = {}, defaults = DEFAULT_APPEARANCE) {
  const a = { ...defaults, ...(persisted.appearance || {}) };
  if (!persisted.appearance) {
    if (persisted.theme) a.mode = persisted.theme === "dark" || persisted.theme === "light" ? persisted.theme : "system";
    if (Number.isFinite(+persisted.accentHue)) a.accentHue = +persisted.accentHue;
  }
  return a;
}

// Apply the generic design tokens. `opts.extraApply({ a, root, s, mode })` lets a
// host apply its own app-specific vars (JustWrite's editor) within the same pass.
export function applyAppearance(appearance, opts = {}) {
  if (typeof document === "undefined") return;
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const root = document.documentElement;
  const mode = resolveMode(a.mode);
  lastResolvedMode = mode;
  lastApplied = a;
  lastOpts = opts;

  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;

  const s = root.style;

  if (Number.isFinite(+a.accentHue)) s.setProperty("--accent-hue", String(a.accentHue));

  const gh = Number.isFinite(+a.goldHue) ? +a.goldHue : 80;
  if (mode === "dark") {
    s.setProperty("--gold", `oklch(0.78 0.10 ${gh})`);
    s.setProperty("--gold-soft", `oklch(0.32 0.045 ${gh})`);
    s.setProperty("--warn-bg",   `oklch(0.28 0.05 ${gh})`);
    s.setProperty("--warn-ink",  `oklch(0.86 0.09 ${gh})`);
    s.setProperty("--warn-line", `oklch(0.42 0.08 ${gh})`);
  } else {
    s.setProperty("--gold", `oklch(0.62 0.085 ${gh})`);
    s.setProperty("--gold-soft", `oklch(0.92 0.045 ${gh})`);
    s.setProperty("--warn-bg",   `oklch(0.97 0.03 ${gh})`);
    s.setProperty("--warn-ink",  `oklch(0.4 0.1 ${gh})`);
    s.setProperty("--warn-line", `oklch(0.85 0.08 ${gh})`);
  }

  if (Number.isFinite(+a.dangerHue))  s.setProperty("--danger-hue",  String(a.dangerHue));
  if (Number.isFinite(+a.successHue)) s.setProperty("--success-hue", String(a.successHue));
  if (Number.isFinite(+a.infoHue))    s.setProperty("--info-hue",    String(a.infoHue));

  s.setProperty("--font-ui", uiStack(a.uiFont));
  s.setProperty("--font-serif", displayStack(a.displayFont));
  // --font-mono is an app constant (each app's tokens.css owns it), not a theme
  // knob — the engine doesn't touch it.

  // Button knobs.
  s.setProperty("--btn-radius", BUTTON_RADIUS_PX[a.btnRadius] || BUTTON_RADIUS_PX.standard);
  const dens = BUTTON_DENSITY[a.btnDensity] || BUTTON_DENSITY.comfy;
  s.setProperty("--btn-pad-y", dens.padY);
  s.setProperty("--btn-pad-x", dens.padX);
  s.setProperty("--btn-pad-y-sm", dens.padYSm);
  s.setProperty("--btn-pad-x-sm", dens.padXSm);
  s.setProperty("--btn-font-size", dens.fontSize);
  // an app's text floor holds here too (--text-floor — JustVoice's 12.5px law, 2026-10-29)
  s.setProperty("--btn-font-size-sm", `max(var(--text-floor, 0px), ${dens.fontSizeSm})`);
  if (a.btnLabelCase === "uppercase") {
    s.setProperty("--btn-text-transform", "uppercase");
    s.setProperty("--btn-letter-spacing", "0.06em");
  } else {
    s.setProperty("--btn-text-transform", "none");
    s.setProperty("--btn-letter-spacing", "normal");
  }

  s.setProperty("--app-bg", resolveTint(a.appBg, SURFACE_TINTS, mode));
  s.setProperty("--sidebar-bg", resolveTint(a.sidebarBg, SURFACE_TINTS, mode));

  // Ink palette — "auto" reverts to tokens.css defaults.
  const ink = INK_PALETTES[a.inkPalette] || INK_PALETTES.auto;
  if (ink.auto) {
    s.removeProperty("--ink"); s.removeProperty("--ink-2");
    s.removeProperty("--muted"); s.removeProperty("--subtle");
  } else {
    const shades = mode === "dark" ? ink.dark : ink.light;
    s.setProperty("--ink", shades[0]);
    s.setProperty("--ink-2", shades[1]);
    s.setProperty("--muted", shades[2]);
    s.setProperty("--subtle", shades[3]);
  }

  const scale = Number(a.uiScale);
  root.style.zoom = Number.isFinite(scale) && scale > 0 ? String(scale) : "";

  // Sidebar section heading typography.
  const hs = SIDEBAR_HEADING_STYLES[a.sidebarHeadingStyle] || SIDEBAR_HEADING_STYLES.eyebrow;
  const sz = SIDEBAR_HEADING_SIZES.find((x) => x.value === a.sidebarHeadingSize) || SIDEBAR_HEADING_SIZES[1];
  s.setProperty("--nav-section-font", hs.font);
  s.setProperty("--nav-section-weight", String(hs.weight));
  s.setProperty("--nav-section-style", hs.italic);
  s.setProperty("--nav-section-transform", hs.transform);
  s.setProperty("--nav-section-letter-spacing", hs.spacing);
  s.setProperty("--nav-section-size", sz.px);

  // Sidebar menu item typography.
  const ns = NAV_ITEM_STYLES[a.navItemStyle] || NAV_ITEM_STYLES.standard;
  const nz = NAV_ITEM_SIZES.find((x) => x.value === a.navItemSize) || NAV_ITEM_SIZES[1];
  s.setProperty("--nav-item-font", ns.font);
  s.setProperty("--nav-item-weight", String(ns.weight));
  s.setProperty("--nav-item-active-weight", String(ns.activeWeight));
  s.setProperty("--nav-item-style", ns.italic);
  s.setProperty("--nav-item-letter-spacing", ns.spacing);
  s.setProperty("--nav-item-size", nz.px);

  // App-specific tokens (JustWrite's manuscript editor, etc.).
  if (typeof opts.extraApply === "function") opts.extraApply({ a, root, s, mode, resolveTint });

  // Track the OS preference only while the user opts into "system".
  if (mql) {
    if (a.mode === "system" && !systemListener) {
      systemListener = () => applyAppearance(lastApplied, lastOpts);
      mql.addEventListener?.("change", systemListener);
    } else if (a.mode !== "system" && systemListener) {
      mql.removeEventListener?.("change", systemListener);
      systemListener = null;
    }
  }
}

export function currentMode() { return lastResolvedMode; }
