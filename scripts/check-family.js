// SPDX-License-Identifier: MIT
// The family divergence check — the three apps against the kit and each other.
//
// Every finding of the 2026-08-07 structure audit (docs/plans/archive/family-structure-audit.md) was
// something a script could have caught the DAY it appeared: a fork of a component the kit
// already exports, a copy of a kit file that had quietly drifted, a missing npm script, a
// server entry module that isn't `serve.py`. Instead they accumulated for months and were
// found by hand. This is that script. Nothing clever — it reads files and compares them.
//
//   Run:  node scripts/check-family.js            (exit 0 = clean, 1 = violations)
//         node scripts/check-family.js --info     (also print the advisory findings)
//
// LIMITATIONS, stated plainly so a clean run is not mistaken for a clean family:
//
//  1. It needs all four repos side by side on disk, so it cannot run in CI unless every
//     repo is checked out. It is a thing a developer (or an agent) runs.
//  2. It matches by NAME. It therefore CANNOT see a fork that was renamed — JustVoice's
//     TaskStrip.vue / TaskStatusPanel.vue / renderTasks.js duplicate the kit's AiTaskStrip
//     / AiStatusPanel / aiTasks and this script is blind to all three, because the names
//     differ. That fork is the reason this script exists and it is the one thing it misses.
//     Same-concept-different-name still needs a human, or an audit like the one in
//     docs/plans/archive/family-structure-audit.md.
//  3. Whether a concept SHOULD be shared at all is judgement. Everything under ADVISORY is
//     a question, not a verdict.
//
// ONE KIND OF APP: every family app is a Quasar app (app-structure.md §Q) — `quasar.config.js`
// exists; an app without one is a violation and its layout checks (scripts 3, server 4, the
// desktop main 14, the Quasar layout) don't run. The kit's `template/` — the §Q reference app —
// is checked against §Q too (its layout checks only: it is not a product, so the docs checks
// don't apply). The Tauri + Python kind and its checks were deleted 2026-10-08, the Electron +
// Vite kind and its checks 2026-10-09: no family app runs either.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPlanText, kitExports as planKitExports } from "./check-plan.js";
import { installedSkillDrift } from "./install-skills.js";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAMILY = resolve(KIT, "..");

// FAMILY_<NAME>_DIR checks another checkout of an app — a branch in its own worktree before it's
// merged (FAMILY_DOCGEN_DIR=../docgen-quasar).
const APPS = [
  { name: "JustWrite", dir: process.env.FAMILY_JUSTWRITE_DIR || join(FAMILY, "justwrite-app") },
  { name: "JustVoice", dir: process.env.FAMILY_JUSTVOICE_DIR || join(FAMILY, "JustVioce") },
  { name: "docgen", dir: process.env.FAMILY_DOCGEN_DIR || join(FAMILY, "just_ai_i18n_docgen") },
  { name: "just-house-paint", dir: process.env.FAMILY_HOUSE_PAINT_DIR || join(FAMILY, "just-house-paint") },
];

/** The reference app (`template/`) — a complete family app since 2026-10-18, checked as a product
 * like the apps (the kit's TASKS, "A standard start…": "checked by the guard as a product"). */
const TEMPLATE = { name: "template", dir: join(KIT, "template") };

/** "quasar" (§Q), or "unknown" — which is a violation. */
const kindOf = (app) => (existsSync(join(app.dir, "quasar.config.js")) ? "quasar" : "unknown");
for (const app of [...APPS, TEMPLATE]) app.kind = kindOf(app);

// The family port registry (app-structure §1) — an app's desktop main passes it as `port`.
const APP_PORTS = { JustWrite: 17495, JustVoice: 17494, docgen: 8742, template: 17490, "just-house-paint": 17499 };
// The dev-server ports (app-structure §1) — quasar.config.js `devServer.port`, and its HMR port
// where the app sets one; installLlmUi's devPorts and the server's dev origins name the same
// numbers. A new app takes the next free ones — not 17496 (JW's smoke scratch) or 1440 (JV's
// second renderer).
const DEV_PORTS = {
  JustWrite: { dev: 1420 },
  JustVoice: { dev: 1430, hmr: 1431 },
  docgen: { dev: 1450, hmr: 1451 },
  template: { dev: 9000 },
  "just-house-paint": { dev: 1460, hmr: 1461 },
};

// Ruled exceptions. An entry here means a human looked and decided it is NOT a fork —
// with the reason, so the next reader doesn't have to re-derive it. Keep this short: a
// long allowlist means the rule is wrong, not that the code is fine.
const ALLOW = new Map([
  ["JustVoice/QuickSetup.vue", "TTS-engine wizard; the kit's QuickSetup is the LLM one (ruling 6, 2026-08-05)"],
]);

const problems = [];
const infos = [];
const fail = (app, msg) => problems.push(`${app.padEnd(10)} ${msg}`);
const info = (app, msg) => infos.push(`${app.padEnd(10)} ${msg}`);

// ── file walking ──────────────────────────────────────────────────────────────
const SKIP = new Set(["node_modules", "dist", ".git", "__pycache__", ".venv", "build", "target", "e2e"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** `files` without those the repo's .gitignore leaves out (a generated bundle — JustWrite's
 *  src/phone/worker-bundle/server-worker.js was reported as its own code, 2026-10-20). Git's own answer
 *  (`git check-ignore --stdin`); not a git checkout, or git not there: all of them. */
function notIgnored(dir, files) {
  if (!files.length) return files;
  const r = spawnSync("git", ["-C", dir, "check-ignore", "--stdin", "-z"], { input: files.map((f) => relative(dir, f)).join("\0"), encoding: "utf8" });
  // 0: some ignored, 1: none, 128: not a repo (or another error) — keep everything
  if (r.status !== 0) return files;
  const ignored = new Set(r.stdout.split("\0").filter(Boolean).map((p) => resolve(dir, p).toLowerCase()));
  return files.filter((f) => !ignored.has(resolve(f).toLowerCase()));
}

const hash = (p) => createHash("sha1").update(readFileSync(p, "utf8").replace(/\r\n/g, "\n")).digest("hex");

// ── what the kit exports ──────────────────────────────────────────────────────
// Two forms: `export { default as Name } from …` and `export { a, b } from …`, plus one
// `export * from "./common/index.js"` that has to be followed or half the surface is missed.
function kitExports() {
  const names = new Set();
  const read = (file) => {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const star = line.match(/^export \* from "(.+)"/);
      if (star) { read(resolve(dirname(file), star[1])); continue; }
      const block = line.match(/^export \{([^}]+)\}/);
      if (!block) continue;
      for (const raw of block[1].split(",")) {
        const name = raw.trim().replace(/^default as /, "").split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
  };
  read(join(KIT, "packages/ui/src/index.js"));
  return names;
}

// ── check 1 · an app defining what the kit already exports ────────────────────
// The distinction that matters, and the one a filename alone gets WRONG: docgen's
// TitleBar.vue *imports* the kit's TitleBar and fills its slot — a wrapper, which is the
// intended pattern. JustWrite's does not — that's the fork. So: match by name, then read
// the file to see whether it consumes the kit's version.
function checkForks(app, files, exports_) {
  for (const file of files) {
    const stem = basename(file, extname(file));
    if (!exports_.has(stem)) continue;
    if (ALLOW.has(`${app.name}/${basename(file)}`)) continue;
    const src = readFileSync(file, "utf8");
    const wraps = new RegExp(`import[^;]*\\b${stem}\\b[^;]*from\\s+["']@delebash/ui["']`, "s").test(src);
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    if (wraps) info(app.name, `${rel} wraps the kit's ${stem} — OK`);
    else fail(app.name, `${rel} redefines ${stem}, which the kit exports (and does not import it)`);
  }
}

// ── check 2 · a copy of a kit file that has drifted ───────────────────────────
// A SHARED NAME IS NOT A COPY. The first version of this check compared by filename and
// reported an app's `router/index.js` as a drifted copy of the kit's `index.js` — nonsense,
// and exactly the by-the-filename error the audit exists to stop. So: same name AND the
// contents actually overlap. Jaccard over trimmed non-blank lines; a genuine copy scores
// high even after edits, two unrelated `index.js` files score ~0.
const COPY_THRESHOLD = 0.35;
const MIN_LINES = 10;

function lineSet(p) {
  return new Set(readFileSync(p, "utf8").split("\n").map((l) => l.trim()).filter((l) => l.length > 3));
}
function similarity(a, b) {
  const A = lineSet(a);
  const B = lineSet(b);
  if (A.size < MIN_LINES || B.size < MIN_LINES) return 0;
  let shared = 0;
  for (const line of A) if (B.has(line)) shared += 1;
  return shared / (A.size + B.size - shared);
}

function checkDrift(app, files, kitFiles) {
  for (const file of files) {
    const name = basename(file);
    const twin = kitFiles.get(name);
    if (!twin) continue;
    if (ALLOW.has(`${app.name}/${name}`)) continue;
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    if (hash(file) === hash(twin)) {
      fail(app.name, `${rel} is a byte-identical copy of the kit's ${name} — delete it and import`);
      continue;
    }
    const score = similarity(file, twin);
    if (score >= COPY_THRESHOLD) {
      fail(app.name, `${rel} is a DRIFTED copy of the kit's ${name} — ${Math.round(score * 100)}% shared lines, ${lineCount(file)} vs ${lineCount(twin)}`);
    }
  }
}
const lineCount = (p) => readFileSync(p, "utf8").split("\n").length;

// ── check 3 · npm script names are the contract (app-structure §Q.9) ───────────
// §Q.9's list; the e2e names (`test`, `screenshots`) are not required.
const REQUIRED_SCRIPTS = ["dev", "build", "build:spa", "server", "lint"];

function checkScripts(app) {
  const pkgPath = join(app.dir, "package.json");
  if (!existsSync(pkgPath)) return fail(app.name, "no package.json");
  const scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts || {};
  for (const need of REQUIRED_SCRIPTS) {
    if (!scripts[need]) fail(app.name, `package.json has no "${need}" script (§Q.9 names are the contract)`);
  }
  if (scripts.tauri) fail(app.name, `package.json still has a "tauri" script — the Tauri CLI went with the move (§Q.9)`);
  // §Q.9: the desktop app is the default; the browser build is build:spa; the server is its
  // own package, run from source on Electron's own Node, through scripts/node24.js.
  const want = [
    ["dev", "quasar dev -m electron", /^quasar dev -m electron\b/],
    ["build", "quasar build -m electron", /^quasar build -m electron\b/],
    ["build:spa", "quasar build", /^quasar build\s*$/],
    ["server", "node scripts/node24.js server/src/serve.js serve", /^node scripts\/node24\.js server\/src\/serve\.js serve\b/],
  ];
  for (const [name, text, re] of want) {
    if (scripts[name] && !re.test(scripts[name])) fail(app.name, `"${name}" runs \`${scripts[name]}\` — §Q.9 says \`${text}\``);
  }
  return undefined;
}

// ── AGENTS.md carries the family rules (the kit's TASKS, "A standard start…", decision 2) ────
// Other AI tools read AGENTS.md and follow no @ imports, so the file holds a copy of
// docs/family-rules.md between two markers; the copy must stay identical to the kit's. An app that
// hasn't moved to AGENTS.md yet is an advisory; the template must have it.
const RULES_START = "<!-- family-rules:start -->";
const RULES_END = "<!-- family-rules:end -->";
function checkAgentsRules(app) {
  const file = join(app.dir, "AGENTS.md");
  const text = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
  const a = text.indexOf(RULES_START);
  const b = text.indexOf(RULES_END);
  if (a < 0 || b < a) {
    const msg = `AGENTS.md ${text ? "has no family-rules block" : "missing"} — it carries docs/family-rules.md between ${RULES_START} and ${RULES_END} (§2)`;
    if (app === TEMPLATE) fail(app.name, msg);
    else info(app.name, msg);
    return;
  }
  const copy = text.slice(a + RULES_START.length, b).trim();
  const rules = readFileSync(join(KIT, "docs", "family-rules.md"), "utf8").replace(/\r\n/g, "\n").trim();
  if (copy !== rules) fail(app.name, "AGENTS.md's family-rules block differs from the kit's docs/family-rules.md — copy it again, verbatim");
}

// ── the common server parts (app-structure §14, §15) ─────────────────────────────
// Sameness by construction (the kit's TASKS, "A standard start…", DIRECTION 2026-10-17): the parts
// every server has in common come from the kit — /v1/health is the kit's makeHealthRouter, an
// unhandled exception is the kit's family envelope (no app passes its own onUnhandled), and the
// version is the package's, never a literal typed into code; the app's and the server's
// package.json versions agree.
function checkCommonServer(app) {
  const src = join(app.dir, "server", "src");
  const files = walk(src).filter((f) => f.endsWith(".js"));
  const text = (f) => readFileSync(f, "utf8");
  if (!files.some((f) => /\bmakeHealthRouter\s*\(/.test(text(f)))) {
    fail(app.name, "server/src mounts no makeHealthRouter — /v1/health is the kit's shared router (§14)");
  }
  for (const f of files) {
    if (/createServer\s*\(\s*\{[^}]*\bonUnhandled\s*:/.test(text(f))) {
      fail(app.name, `${relative(app.dir, f).replace(/\\/g, "/")} passes its own onUnhandled — an unhandled exception is the kit's family envelope (§15)`);
    }
  }
  const versionFile = join(src, "version.js");
  if (existsSync(versionFile) && /\bVERSION\s*=\s*["'`]/.test(text(versionFile))) {
    fail(app.name, 'server/src/version.js types its VERSION — read it from package.json (`import pkg from "../package.json" with { type: "json" }`, §14)');
  }
  const rootPkg = join(app.dir, "package.json");
  const serverPkg = join(app.dir, "server", "package.json");
  if (existsSync(rootPkg) && existsSync(serverPkg)) {
    const a = JSON.parse(readFileSync(rootPkg, "utf8")).version;
    const b = JSON.parse(readFileSync(serverPkg, "utf8")).version;
    if (a !== b) fail(app.name, `package.json is ${a} but server/package.json is ${b} — one version for the app (§14)`);
  }
}

// ── check 4 · the server layout (app-structure §Q.3) ──────────────────────────
// The server is plain JavaScript in server/src/, entered by serve.js; its tests are vitest
// files in server/tests/. It is also its own package (the packaged app installs only what
// src-electron/package.json names).
function checkServer(app) {
  const serverDir = join(app.dir, "server");
  const section = "§Q.3";
  if (!existsSync(join(serverDir, "src", "serve.js"))) {
    fail(app.name, `server/src/serve.js missing — the server's entry (\`serve\`), what the shell and the launcher run (${section})`);
  }
  const pkgPath = join(serverDir, "package.json");
  if (!existsSync(pkgPath)) {
    fail(app.name, "server/package.json missing — the server is its own package (§Q.3)");
  } else {
    const p = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (p.type !== "module") fail(app.name, `server/package.json "type" is ${JSON.stringify(p.type)} — the family is "module"`);
    if (!/-server$/.test(p.name || "")) fail(app.name, `server/package.json is named ${JSON.stringify(p.name)} — §Q.3 says "<app>-server"`);
    // The family's servers are Hono, and ONE Hono: the kit's (2026-10-09 — the kit's TASKS, "The
    // family's servers move to Hono"; docs/plans/2026-10-09-hono-standard.md §10).
    for (const d of Object.keys({ ...(p.dependencies || {}), ...(p.devDependencies || {}) })) {
      if (/^(fastify|@fastify\/(static|multipart|cors|formbody))$/.test(d)) {
        fail(app.name, `server/package.json depends on ${d} — the family's servers are Hono (${section})`);
      }
      if (/^(hono|@hono\/.+)$/.test(d)) {
        fail(app.name, `server/package.json depends on ${d} — one Hono for the family: an app takes Hono, stream and serveStatic from the kit (${section})`);
      }
    }
  }
  const testsDir = join(serverDir, "tests");
  const jsTests = existsSync(testsDir) ? readdirSync(testsDir).filter((f) => f.endsWith(".test.js")) : [];
  if (!jsTests.length) fail(app.name, `no server/tests/*.test.js — the server's tests are vitest files (${section})`);
  const vitestCfg = join(serverDir, "vitest.config.js");
  if (existsSync(vitestCfg) && !readFileSync(vitestCfg, "utf8").includes("tests/**/*.test.js")) {
    fail(app.name, `server/vitest.config.js does not include \`tests/**/*.test.js\` — \`test:server\` would run nothing (${section})`);
  }
  return undefined;
}

// ── check 5 · hand-rolled where the kit exports the helper ────────────────────
// Deliberately worded as a question, not a verdict. A static check cannot tell a POLL
// (re-fetch on a timer — usePoll's job) from a UI TICKER (advance a clock so an elapsed
// readout re-renders — not usePoll's job, and rewriting one would be wrong). JustVoice's
// DictateWindow elapsed timer and renderTasks' 100 ms `now` tick are tickers; TrainView's
// 2 s job refresh is a poll. Only a human can sort them, so the line asks rather than tells.
const HAND_ROLLED = [
  { pattern: /setInterval\s*\(/, kit: "usePoll", note: "uses setInterval — if it POLLS (vs ticking a clock)", unless: onlyClockTicks },
];

// One shape IS sortable statically (2026-10-20, JustWrite's Sidebar.vue): a callback whose every statement only sets
// something to the time now (`now.value = Date.now()`, `new Date()`, `performance.now()`) ticks a clock — it asks no
// one anything, so it is never a poll. Any other body (a call, a fetch, a store's refresh) is still asked about.
const CLOCK_TICK = /^[\w$.[\]"']+\s*=\s*(?:Date\.now\(\)|new Date\(\)|performance\.now\(\))$/;
function onlyClockTicks(src) {
  const calls = [...src.matchAll(/setInterval\s*\(\s*(?:\(\s*\)\s*=>\s*(?:\{([^{}]*)\}|\(([^()]*(?:\(\)[^()]*)*)\)|([^,{(][^,]*))|function\s*\w*\s*\(\s*\)\s*\{([^{}]*)\})\s*,/g)];
  if (!calls.length || calls.length !== (src.match(/setInterval\s*\(/g) || []).length) return false;
  return calls.every((m) => {
    const body = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
    const statements = body.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    return statements.length > 0 && statements.every((s) => CLOCK_TICK.test(s));
  });
}

function checkHandRolled(app, files) {
  for (const file of files) {
    if (![".js", ".vue"].includes(extname(file))) continue;
    const src = readFileSync(file, "utf8");
    for (const { pattern, kit, note, unless } of HAND_ROLLED) {
      if (!pattern.test(src) || unless?.(src)) continue;
      const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
      info(app.name, `${rel} hand-rolls ${note} — the kit exports ${kit}`);
    }
  }
}

// ── checks 11-14 · THE SHELL LAYER (added 2026-08-15) ─────────────────────────
// Why these exist: on 2026-08-14 this guard reported "✓ no violations" while the
// three apps opened a folder three different ways (a hand-rolled per-platform
// spawn, the `open` crate, and tauri-plugin-opener), shipped three different
// plugin sets, installed an Electron-era `window.justwrite` global, and carried
// SEVEN copies of `a.download = filename`. Every check below would have FAILED
// that day. A check that would have passed is decoration and does not belong.
//
// The rule they encode: you cannot grep for the same job done differently, so
// each of these asserts the ONE door instead of hunting for its copies.

/** Renderer file → the source, minus its comments (so a comment naming a banned
 *  pattern doesn't trip the check). Crude but adequate: strips // and /* *​/. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// A copy to the clipboard is Quasar's copyToClipboard: `navigator.clipboard` is missing on a page served over
// plain http — a browser on another computer — and every Copy failed there (2026-10-19). Required in the kit's
// UI and where the release is required, advisory elsewhere.
function checkClipboard(name, dir, files, required) {
  for (const file of files) {
    if (![".js", ".vue"].includes(extname(file)) || /\.test\.js$/.test(file)) continue;
    // a write (a paste's readText has no fallback to point at)
    // `navigator.clipboard.writeText(`, its `?.` form, or the clipboard kept in a name to write through
    if (!/navigator\.clipboard\s*(\?\.|\.)\s*write(Text)?\s*\(|=\s*navigator\.clipboard\s*[;,)\n]/.test(codeOf(file))) continue;
    const rel = relative(dir, file).replace(/\\/g, "/");
    (required ? fail : info)(name, `${rel} copies with navigator.clipboard — missing on a page served over plain http (a browser on another computer); use Quasar's copyToClipboard`);
  }
}

// check 11 · ONE save door. `a.download = …` is the shape of a hand-rolled
// download; the kit's fileSave.js is the only place allowed to write it.
function checkOneSaveDoor(app, files) {
  for (const file of files) {
    if (![".js", ".vue"].includes(extname(file))) continue;
    if (!/\.download\s*=/.test(codeOf(file))) continue;
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    fail(app.name, `${rel} hand-rolls a file download (\`a.download =\`) — the kit exports saveBlob/downloadBlob (common/services/fileSave.js). JustVoice had FIVE of these.`);
  }
}

// check 12 · ONE door to the shell. `invoke()` belongs in services/native.js, so
// a command's name-as-a-string exists in exactly one place per app. No `@tauri-apps/*`
// import anywhere in src/ (native.js included), and the ONE bridge object — the kit
// preload's `window.appShell` — plus the kit's `isDesktopShell` test are read only by
// native.js (§Q.2, §5; the rule that replaced "no window.<app> global", 2026-10-08).
// check · one Hono. An app's server code takes Hono from the kit, never its own copy: the kit is
// linked (`file:`), and Hono's `app.route()` recognises a sub-app's default error handler by
// identity — a sub-app from a second copy answers errors with Hono's plain 500 (found 2026-10-09).
// Fastify is gone from the family the same day.
function checkOneHono(app, files) {
  for (const file of files) {
    if (extname(file) !== ".js") continue;
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    if (!rel.startsWith("server/")) continue;
    const code = codeOf(file);
    if (/\bfrom\s+["'](hono|hono\/[^"']+|@hono\/[^"']+)["']/.test(code)) {
      fail(app.name, `${rel} imports Hono itself — one Hono for the family: take Hono, stream and serveStatic from "@delebash/core/platform" (§Q.3)`);
    }
    if (/\bfrom\s+["'](fastify|@fastify\/(static|multipart|cors|formbody))["']/.test(code)) {
      fail(app.name, `${rel} imports Fastify — the family's servers are Hono (§Q.3)`);
    }
  }
}

function checkOneShellDoor(app, files) {
  for (const file of files) {
    if (![".js", ".vue"].includes(extname(file))) continue;
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    const isDoor = rel === "src/services/native.js";
    const code = codeOf(file);
    if (/@tauri-apps\//.test(code)) {
      fail(app.name, `${rel} imports @tauri-apps — the family has no Tauri; the shell is window.appShell through services/native.js (§Q.2)`);
    }
    if (isDoor) continue;   // THE door itself
    if (/\bwindow\.appShell\b|\bappShell\.(invoke|on)\b/.test(code)) {
      fail(app.name, `${rel} reads window.appShell — the one bridge object is read only by services/native.js (§Q.2)`);
    }
    if (/\bisDesktopShell\b/.test(code)) {
      fail(app.name, `${rel} asks isDesktopShell itself — native.js is the one place that asks (its hasShell) (§Q.2)`);
    }
  }
}

// check 13 · no renderer installs a global on `window`. That was the shape of
// JustWrite's Electron-era `window.justwrite` bridge, deleted 2026-08-14. The one bridge
// is the kit PRELOAD's `window.appShell` — the renderer publishes nothing.
function checkNoWindowGlobal(app, files) {
  for (const file of files) {
    if (![".js", ".vue"].includes(extname(file))) continue;
    const m = codeOf(file).match(/\bwindow\.([A-Za-z_$][\w$]*)\s*=\s*\{/);
    if (!m || ["fetch", "onerror", "onload"].includes(m[1])) continue;
    const rel = file.slice(app.dir.length + 1).replace(/\\/g, "/");
    fail(app.name, `${rel} installs a window.${m[1]} global — apps import modules, they do not publish bridges (the window.justwrite shim died 2026-08-14)`);
  }
}

// check 14 · there is ONE shell, the kit's `runDesktopApp`. An app's desktop main,
// src-electron/electron-main.js (§Q.2), imports it from `@delebash/core/shell`, passes
// the required config fields, claims its registered port, and imports nothing else but
// `node:*` and `#q-app/electron/main` (for the icon path) — no logic in main. The preload is
// the kit's too: src-electron/electron-preload.js imports it.
const MAIN_REQUIRED_FIELDS = ["id", "appName", "productName", "port", "serverEntry", "dataDirEnv", "repoRoot", "distDir"];
const DESKTOP_MAIN = { rel: "src-electron/electron-main.js", section: "§Q.2", allowed: ["@delebash/core/shell", "#q-app/electron/main"] };

function checkDesktopMain(app) {
  const { rel, section, allowed } = DESKTOP_MAIN;
  const mainPath = join(app.dir, rel);
  if (!existsSync(mainPath)) return fail(app.name, `${rel} missing — the desktop app is the kit's runDesktopApp (${section})`);
  const code = codeOf(mainPath);
  if (!/import\s*\{[^}]*\brunDesktopApp\b[^}]*\}\s*from\s*["']@delebash\/core\/shell["']/.test(code)) {
    fail(app.name, `${rel} does not import runDesktopApp from @delebash/core/shell — the family's one shell (${section})`);
  }
  for (const [, spec] of code.matchAll(/(?:^|\n)\s*import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g)) {
    if (spec.startsWith("node:") || allowed.includes(spec)) continue;
    fail(app.name, `${rel} imports ${spec} — main is the kit's runDesktopApp plus config; no logic lives there (${section})`);
  }
  const at = code.indexOf("runDesktopApp(");
  if (at < 0) return fail(app.name, `${rel} never calls runDesktopApp(…) (${section})`);
  const call = code.slice(at);
  const missing = MAIN_REQUIRED_FIELDS.filter((f) => !new RegExp(`[{,\\s]${f}\\s*[:,}]`).test(call));
  if (missing.length) fail(app.name, `${rel}'s runDesktopApp config has no ${missing.join(", ")} (§Q.2 required fields)`);
  const port = call.match(/[{,\s]port\s*:\s*(\d+)/);
  if (port && APP_PORTS[app.name] && Number(port[1]) !== APP_PORTS[app.name]) {
    fail(app.name, `${rel} passes port ${port[1]} — the registry says ${APP_PORTS[app.name]} (§1)`);
  }
  const preload = join(app.dir, "src-electron", "electron-preload.js");
  if (!existsSync(preload) || !/import\s+["']@delebash\/core\/shell\/preload["']/.test(codeOf(preload))) {
    fail(app.name, "src-electron/electron-preload.js does not import the kit's preload (@delebash/core/shell/preload) — §Q.2");
  }
  return undefined;
}

// The dev server claims the app's registered ports (§1): devServer.port, and the HMR port where
// the registry has one (JustVoice's reads an env override first, so only the number is matched).
function checkDevPorts(app) {
  const want = DEV_PORTS[app.name];
  if (!want) return fail(app.name, "has no DEV_PORTS entry — every app registers its dev ports (§1)");
  const conf = existsSync(join(app.dir, "quasar.config.js")) ? readFileSync(join(app.dir, "quasar.config.js"), "utf8") : "";
  const block = conf.match(/devServer:\s*\{([\s\S]*?)\n\s*\}/)?.[1] || "";
  const dev = block.match(/(?:^|[\s{,])port:\s*(\d+)/);
  if (!dev) return fail(app.name, `quasar.config.js's devServer sets no port — the registry says ${want.dev} (§1)`);
  if (Number(dev[1]) !== want.dev) fail(app.name, `quasar.config.js's devServer port is ${dev[1]} — the registry says ${want.dev} (§1)`);
  if (want.hmr) {
    const hmr = block.match(/hmr:\s*\{[^}]*?\b(\d{2,5})\b/);
    if (!hmr || Number(hmr[1]) !== want.hmr) fail(app.name, `quasar.config.js's devServer HMR port is ${hmr?.[1] || "unset"} — the registry says ${want.hmr} (§1)`);
  }
  return undefined;
}

// ── the Quasar layout (app-structure §Q.10) ───────────────────────────────────
// What makes a Quasar app the family's shape rather than Quasar's default: the packaging
// (electron-builder, the main process's local packages installed as real copies), the server
// package beside it, the CSP that lets the page reach its server, the npm traps handled, the
// dev data folder unwatched and uncommitted, and nothing left of the Electron + Vite layout.
function checkQuasar(app) {
  const name = app.name;
  const read = (rel) => (existsSync(join(app.dir, rel)) ? readFileSync(join(app.dir, rel), "utf8") : null);
  const json = (rel) => { const t = read(rel); return t === null ? null : JSON.parse(t); };

  const root = json("package.json") || {};
  if (root.type !== "module") fail(name, `package.json "type" is ${JSON.stringify(root.type)} — the family is "module"`);
  if (!root.allowScripts) fail(name, `package.json has no "allowScripts" — npm 11 refuses the installs Quasar spawns without it (§Q.6)`);
  if (!(root.workspaces || []).includes("server")) fail(name, `package.json "workspaces" doesn't name "server" — one install for the renderer and the server, one copy of what they share (§Q.3)`);
  const node24 = read("scripts/node24.js");
  if (node24 === null) fail(name, "scripts/node24.js missing — the server and its tests run on Electron's own Node (§Q.9)");
  else if (!/ELECTRON_RUN_AS_NODE/.test(node24) || !/src-electron/.test(node24)) {
    fail(name, "scripts/node24.js doesn't run src-electron's Electron as Node (ELECTRON_RUN_AS_NODE) — §Q.9");
  }
  for (const dep of Object.keys({ ...root.dependencies, ...root.devDependencies })) {
    if (dep.startsWith("@tauri-apps/")) fail(name, `package.json depends on ${dep} — the family has no Tauri`);
  }

  const cfg = read("quasar.config.js") || "";
  const needs = [
    [/vueRouterMode:\s*['"]hash['"]/, "build.vueRouterMode 'hash' (§Q.4)"],
    [/bundler:\s*['"]builder['"]/, "electron.bundler 'builder' — electron-builder (§Q.2)"],
    [/extendElectronPackageJson/, "electron.extendElectronPackageJson making the file: dependencies absolute (§Q.2)"],
    [/--install-links/, "electron.unPackagedInstallParams with --install-links (§Q.2)"],
    [/\*\*\/data\/\*\*/, "the dev watcher ignoring **/data/** (§Q.8)"],
    [/delete\s+process\.env\.npm_config_allow_scripts/, "the npm_config_allow_scripts delete (§Q.6)"],
  ];
  for (const [re, what] of needs) if (!re.test(cfg)) fail(name, `quasar.config.js has no ${what}`);

  const electronPkg = json("src-electron/package.json");
  if (!electronPkg) fail(name, "src-electron/package.json missing — the main process's dependencies (§Q.1)");
  else {
    const ver = electronPkg.devDependencies?.electron || electronPkg.dependencies?.electron || "";
    if (!/^\d+\.\d+\.\d+$/.test(ver)) fail(name, `src-electron/package.json pins electron as "${ver}" — exact versions only (§Q.1)`);
    const serverName = json("server/package.json")?.name;
    if (serverName && !electronPkg.dependencies?.[serverName]) {
      fail(name, `src-electron/package.json does not depend on ${serverName} — the packaged app installs only what it names (§Q.3)`);
    }
    if (!electronPkg.allowScripts) fail(name, `src-electron/package.json has no "allowScripts" (§Q.6)`);
  }
  if (existsSync(join(app.dir, "src-capacitor", "package.json")) && !json("src-capacitor/package.json").allowScripts) {
    fail(name, `src-capacitor/package.json has no "allowScripts" (§Q.6)`);
  }

  const html = read("index.html") || "";
  // the policy itself is full of single quotes ('self'), so the attribute is read by its own quote
  const csp = html.match(/http-equiv=["']Content-Security-Policy["'][\s\S]*?content=(?:"([^"]*)"|'([^']*)')/i);
  const policy = csp ? (csp[1] ?? csp[2]) : "";
  if (!csp) fail(name, "index.html has no CSP <meta> — §Q.5");
  else if (!/connect-src[^;]*\bhttp:/.test(policy)) fail(name, "index.html's CSP has no connect-src allowing http: — the page can't reach its server (§Q.5)");

  if (!existsSync(join(app.dir, "biome.json"))) fail(name, "biome.json missing — Biome is the family's linter (§Q.1)");
  if (!/dropQuasarDisabledRule\(\)/.test(read("postcss.config.js") || "")) {
    fail(name, "postcss.config.js doesn't run the kit's dropQuasarDisabledRule() — Quasar's global disabled rule would override every control's own disabled look (§Q.4)");
  }
  if (!/quasarBaseLayer\(\)/.test(read("postcss.config.js") || "")) {
    fail(name, "postcss.config.js doesn't run the kit's quasarBaseLayer() — Quasar's stylesheet would compete with the kit's and the app's rules by specificity and load order (§Q.4)");
  }
  const variables = read("src/css/quasar.variables.scss") || "";
  if (!/@delebash\/ui\/quasar\/variables\.scss/.test(variables)) {
    fail(name, "src/css/quasar.variables.scss doesn't import the kit's @delebash/ui/quasar/variables.scss — the family theme (§Q.4)");
  }
  const qconf = read("quasar.config.js") || "";
  if (!/framework:\s*\{[\s\S]*?config:\s*\{[^}]*\bripple:\s*false/.test(qconf)) {
    fail(name, "quasar.config.js's framework.config doesn't turn the ripple off (ripple: false) — the family draws no Material ripple (§Q.4)");
  }
  if (!/framework:\s*\{[\s\S]*?plugins:\s*\[[^\]]*["']Notify["']/.test(qconf)) {
    fail(name, "quasar.config.js's framework.plugins doesn't list 'Notify' — the kit's pushToast() runs on it (§Q.4)");
  }
  // The kit's controls import Quasar by bare name from the kit's own folder, which has no
  // node_modules: one copy of Quasar comes from the app's, as for the kit's other peers.
  for (const rel of ["quasar.config.js", "vitest.config.js"]) {
    // the spread of Vite's own list (`...(viteConf.resolve.dedupe || [])`) is dropped first — its
    // `[]` would end the match before the app's list
    const text = (read(rel) || "").replace(/\.\.\.\([^)]*\)/g, "");
    const list = text.match(/dedupe\s*(?:=|:)\s*\[([\s\S]*?)\]/);
    if (list && !/["']quasar["']/.test(list[1])) {
      fail(name, `${rel}'s resolve.dedupe has no "quasar" — the kit's controls would load a second Quasar (§Q.4)`);
    }
  }
  const gi = read(".gitignore") || "";
  if (!/^\/?data\/?\s*$/m.test(gi)) fail(name, ".gitignore does not ignore data/ — the dev data folder is never committed (§Q.8)");
  for (const rel of ["vite.config.js", "src/main.js", "electron/main.js", "src-tauri"]) {
    if (existsSync(join(app.dir, rel))) fail(name, `${rel} exists — a Quasar app has none (quasar.config.js is the one build config, boot files replace main.js; §Q.1)`);
  }
  for (const rel of ["src/router/index.js", "src/router/routes.js", "src/stores/index.js", "src/css/quasar.variables.scss", "src/App.vue"]) {
    if (!existsSync(join(app.dir, rel))) fail(name, `${rel} missing — Quasar's layout (§Q.1)`);
  }
  // The renderer is laid out as Quasar's CLI creates a project (the user, 2026-10-09: "whatever the
  // layout that the quassar cli crete for new project is what we use"): the chrome in
  // layouts/MainLayout.vue, the screens in pages/, the stylesheets in css/, and a bare root.
  if (!existsSync(join(app.dir, "src/layouts/MainLayout.vue"))) {
    fail(name, "src/layouts/MainLayout.vue missing — the app's chrome is Quasar's layout, as the CLI creates it (§Q.1)");
  }
  const pagesDir = join(app.dir, "src/pages");
  if (!existsSync(pagesDir) || !walk(pagesDir).some((f) => f.endsWith(".vue"))) {
    fail(name, "src/pages/ has no pages — the screens are <Name>Page.vue there, as the CLI creates them (§Q.1)");
  }
  for (const rel of ["src/views", "src/styles", "src/AppShell.vue"]) {
    if (existsSync(join(app.dir, rel))) fail(name, `${rel} exists — the CLI's layout has pages/, css/ and layouts/MainLayout.vue in its place (§Q.1)`);
  }
  const appVue = read("src/App.vue") || "";
  const appTemplate = (appVue.match(/<template>([\s\S]*)<\/template>/) || [])[1] || "";
  if (appTemplate.replace(/<!--[\s\S]*?-->/g, "").trim() !== "<router-view />") {
    fail(name, "src/App.vue's template is not a bare <router-view /> — what shows is the routes' choice, as the CLI creates the root (§Q.1)");
  }
}

// ── check 6 · the same file in two apps and in neither the kit nor the standard ─
// Files every app must have at a path its framework fixes, each already the kit's in one line — not copies to
// promote: Quasar reads src/css/quasar.variables.scss from the app (quasar.dev/style/sass-scss-variables), and each
// app's is `@import "@delebash/ui/quasar/variables.scss"` (2026-10-24, the engines plan's F6).
const FRAMEWORK_PATHS = new Map([["quasar.variables.scss", /^(\s*\/\/[^\n]*\n)*\s*@import\s+["']@delebash\/ui\/quasar\/variables\.scss["'];\s*$/]]);
function checkCrossAppTwins(perApp, kitFiles) {
  const seen = new Map();
  for (const [app, files] of perApp) {
    for (const file of files) {
      const name = basename(file);
      if (kitFiles.has(name)) continue;
      if (FRAMEWORK_PATHS.get(name)?.test(readFileSync(file, "utf8").replace(/\r\n/g, "\n"))) continue;
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push({ app, file });
    }
  }
  for (const [name, hits] of seen) {
    if (hits.length < 2) continue;
    // Identical, or near enough that one was copied from the other. Two apps each having
    // their OWN SettingsView.vue is expected and scores ~0; a copied helper scores high.
    const score = similarity(hits[0].file, hits[1].file);
    if (hash(hits[0].file) === hash(hits[1].file)) {
      info("family", `${name} is IDENTICAL in ${hits.map((h) => h.app).join(" + ")} and absent from the kit — should it be shared?`);
    } else if (score >= COPY_THRESHOLD) {
      info("family", `${name} is ${Math.round(score * 100)}% shared between ${hits.map((h) => h.app).join(" + ")} and absent from the kit — a copy nobody promoted?`);
    }
  }
}

// ── check 7 · retired names must not be referenced anywhere ───────────────────
// A move or delete is finished only when nothing points at the old name — code,
// scripts, docs, comments, anything. The convergence pieces retired the names
// below (derived from `git log --diff-filter=DR` over the piece commits; the
// 2026-08-08 backfill sweep). The misses this rule exists to prevent were real:
// JW's smoke.js and bench drive.js spawned the DELETED justwrite_server.cli for
// a day after P3, and JV's __main__.py froze the dead cli.app into the sidecar
// entry. History is exempt (docs/plans/**, the audit ledger, the target tree);
// RETIRED_ALLOW marks per-file provenance prose that DESCRIBES a retirement.
const RETIRED = new Map([
  ["JustWrite", [
    /api\/(autosave|book_transfer|chat|health|images|projects|rag|server_auth|sessions|settings|sweep_draft|versions)\.py\b/,
    /justwrite_server\/(models|seed|demo_seed|database|cli|csrf)\.py\b/,
    /justwrite_server\.(models|seed|demo_seed|cli|csrf)\b/,
    /justwrite_server\/llm\//,
    // The splash skip died in the 2026-08-04 kit BootModelLoad adoption; the
    // stale selector silently broke the smoke's escape for four days.
    /jw-bw-skip\b/,
    // P8: tests live BESIDE their files (the 2-of-3 convention) — the five
    // __tests__/ dirs flattened; ShortcutCheatsheet became KeyboardCheatsheet;
    // tokens.css + styles.css moved to src/styles/.
    /__tests__/,
    /ShortcutCheatsheet/,
    /src\/(tokens|styles)\.css|"\.\/(tokens|styles)\.css"/,
    // P10: the lint script covers the whole include surface; biome schema
    // rides the pinned 2.5.x CLI.
    /"lint": "biome check src"/,
    /schemas\/2\.4\./,
  ]],
  ["JustVoice", [
    /components\/TaskStrip\.vue|components\/TaskStatusPanel\.vue|stores\/renderTasks/,
    /justvoice\/csrf\.py\b|justvoice\.csrf\b/,
    /--no-docs\b/,
    /justvoice\.cli serve\b/,
    // P6: the one api file off the _api naming pattern died into health_api.py.
    /api\/health\.py\b/,
    // P8: OverviewView became HomeView (route name/id "overview" → "home";
    // /overview lives on as a redirect only); useUIStore recased to useUiStore;
    // tokens.css + styles.css moved to src/styles/.
    /OverviewView/,
    /useUIStore/,
    /name: "overview"|id: "overview"|"overview":/,
    /src\/(tokens|styles)\.css|"\.\/(tokens|styles)\.css"/,
    // P11: check 8 found the two JV __tests__ files the JW-scoped P8 pattern
    // missed — flattened, and the name is retired HERE too.
    /__tests__/,
    // P10: the extra "@" src alias died (zero imports used it); lint + schema
    // as in JW.
    /"@": path\.resolve|"@": resolve\(/,
    /"lint": "biome check src"/,
    /schemas\/2\.4\./,
  ]],
  ["docgen", [
    /just_ai_i18n_docgen\/csrf\.py\b/,
    /make_workspace_router\b/,
    /app\.state\.workspace\b/,
    // P9: renderer prefs left localStorage for the family /v1/prefs door —
    // the three storage keys died with the conversion.
    /jaid\.(appearance|aiOfferShown|keepServerRunning)/,
    // P10: docgen left JW's dev port for its own 1450/1451 pair; the FLY002
    // fixture ignore died with the family ruff pin; lint + schema as in JW.
    /localhost:1420|127\.0\.0\.1:1420|"1420"|port: 1420|port: 1421/,
    /FLY002/,
    /"lint": "biome check src && /,
    /schemas\/2\.4\./,
  ]],
]);

const KIT_RETIRED = [
  // Only the five form primitives died in the Ui rename — Lu* FEATURE
  // components (LuRunnerEngine, LuModelCatalog, …) are alive and legitimate.
  /ui\/src\/components\/Lu(Button|Input|Segmented|Textarea|Checkbox)\.vue/,
  /ui\/src\/views\/(PromptLab|RoutingPresets)\.vue/,
  /llm\/(tiers|feature_presets_api)\.py\b/,
  // runner-manifest.json is NOT here: it died long before the program and the
  // codebase deliberately documents that death in prose everywhere it matters.
  /runner\/manifest\.py\b/,
];

// Provenance prose — a line that DESCRIBES a retirement is not a stale
// reference. File-scoped with the reason, same contract as ALLOW above.
const RETIRED_ALLOW = new Map([
  ["JustWrite/tests/smoke/headless-smoke.js", "comment records the stale-selector incident the fix closed"],
  // in Quasar's layout router/routes.js holds the routes (it was router/index.js before the move)
  ["JustVoice/src/router/routes.js", "the /overview redirect's comment records the P8 rename it serves"],
]);

// report/ = committed GENERATED artifacts (jscpd) — point-in-time captures,
// same standing as docs/plans history.
const RETIRED_SKIP = /docs[\\/]plans[\\/]|report[\\/]|check-family\.js/;
const RETIRED_TEXT = new Set([".js", ".mjs", ".cjs", ".vue", ".py", ".md", ".rs", ".json",
  ".toml", ".html", ".css", ".txt", ".yml", ".yaml", ".ps1", ".sh"]);
// "models" = downloaded engine/bench model artifacts (HF caches carry BPE
// vocab.json files where every English word is a token — untracked downloads,
// never repo references; the only tracked models/ entry family-wide is a .gitkeep).
// "release" = electron-builder's output (build output, like dist/ and target/). The repo
// root's "data" = the dev data folder (§Q.8, gitignored in every app): user data and
// downloaded models, never a repo reference — skipped at the root only.
const RETIRED_DIR_SKIP = new Set(["node_modules", "dist", ".git", "__pycache__", ".venv",
  "build", "target", "samples", "coverage", "models", "release"]);

function walkRetired(dir, out = [], root = dir) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (RETIRED_DIR_SKIP.has(entry) || entry.endsWith(".egg-info")) continue;
    if (dir === root && entry === "data") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRetired(full, out, root);
    else out.push(full);
  }
  return out;
}

function checkRetired(name, dir, patterns) {
  if (!patterns || !patterns.length) return;
  for (const file of walkRetired(dir)) {
    if (!RETIRED_TEXT.has(extname(file))) continue;
    const rel = file.slice(dir.length + 1).replace(/\\/g, "/");
    if (RETIRED_SKIP.test(rel)) continue;
    if (RETIRED_ALLOW.has(`${name}/${rel}`)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of patterns) {
        if (re.test(line)) {
          fail(name, `retired name in ${rel}:${i + 1} — ${line.trim().slice(0, 90)}`);
          break;
        }
      }
    });
  }
}

// ── check 8 · the family skeleton (app-structure §14) ────────────────────────────
// For every app: tests live beside their files, the lint script gates the whole include
// surface, and Biome is pinned exact. The Quasar layout itself is checkQuasar's (§Q.10); §14's
// renderer lanes, skeleton files and door pins are checkRendererSkeleton's (products only).
function checkSkeleton(app) {
  const name = app.name;
  for (const f of walk(join(app.dir, "src"))) {
    if (basename(dirname(f)) === "__tests__") { fail(name, "a src/**/__tests__/ dir is back — tests live BESIDE their files (P8)"); break; }
  }
  const pkgJson = join(app.dir, "package.json");
  if (existsSync(pkgJson)) {
    const p = JSON.parse(readFileSync(pkgJson, "utf8"));
    if (!(p.scripts?.lint || "").startsWith("biome check .")) {
      fail(name, `"lint" is \`${p.scripts?.lint}\` — the include surface needs \`biome check .\` (P10)`);
    }
    const biome = p.devDependencies?.["@biomejs/biome"] || p.dependencies?.["@biomejs/biome"] || "";
    if (/[\^~]/.test(biome)) fail(name, `@biomejs/biome "${biome}" is a RANGE — the family pins exact (P10)`);
  }
}

// §14's renderer, in the CLI's layout (re-cut 2026-10-09 from the Electron + Vite kind's lists):
// every product has the lanes and the skeleton files, and the kit-door files still ride the kit —
// the ratified page as assertions, INCLUDING its recorded N/As (docgen has no KeyboardCheatsheet —
// the feature is absent — and no composables/ until it has a composable).
const RENDERER_LANES = ["boot", "components", "css", "layouts", "pages", "router", "services", "stores"];
const SKELETON_FILES = [
  "src/css/tokens.css", "src/css/app.scss", "src/pages/HomePage.vue",
  "src/boot.smoke.test.js", "src/services/helpDocs.js", "src/stores/ui.js",
  ".gitattributes", "biome.json", "vitest.config.js", "scripts/node24.js", "server/vitest.config.js",
];
const APP_HAS = {
  composables: new Set(["JustWrite", "JustVoice"]),
  cheatsheet: new Set(["JustWrite", "JustVoice"]),
};
// The kit-door content pins: the named file must actually ride the kit, or the adapter has been
// re-forked in place (name intact, implementation regrown).
const DOOR_PINS = [
  ["src/boot.smoke.test.js", /registerBootSmoke/, "the kit bootSmoke skeleton"],
  ["src/services/helpDocs.js", /makeDocsHelpAdapter/, "the kit helpDocs factory"],
  ["src/stores/ui.js", /useUiStore/, "the family store name"],
];
function checkRendererSkeleton(app) {
  const name = app.name;
  for (const lane of RENDERER_LANES) {
    if (!existsSync(join(app.dir, "src", lane))) fail(name, `src/${lane}/ lane missing (§14)`);
  }
  if (APP_HAS.composables.has(name) && !existsSync(join(app.dir, "src", "composables"))) {
    fail(name, "src/composables/ lane missing (§14)");
  }
  for (const rel of SKELETON_FILES) {
    if (!existsSync(join(app.dir, rel))) fail(name, `${rel} missing — the skeleton (§14)`);
  }
  if (APP_HAS.cheatsheet.has(name) && !existsSync(join(app.dir, "src/components/KeyboardCheatsheet.vue"))) {
    fail(name, "src/components/KeyboardCheatsheet.vue missing (§14)");
  }
  for (const [rel, re, what] of DOOR_PINS) {
    const p = join(app.dir, rel);
    if (existsSync(p) && !re.test(readFileSync(p, "utf8"))) {
      fail(name, `${rel} no longer rides ${what} — the door has been re-forked in place`);
    }
  }
}

/** A launcher's code without its comments: a .cmd/.bat's `rem` and `::` lines (cmd.exe's own comments, `@rem` too),
 *  a shell script's `#` lines and a ` # …` at a line's end (POSIX sh: a word starting with # begins a comment). */
function launcherCode(file, text = readFileSync(file, "utf8")) {
  const lines = text.split(/\r?\n/);
  if (/\.(cmd|bat)$/i.test(file)) return lines.filter((l) => !/^\s*@?(rem(\s|$)|::)/i.test(l)).join("\n");
  return lines
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s#.*$/, ""))
    .join("\n");
}

// The server's packages carry what they need (2026-10-20, JustWrite's start check of the unpacked build): a package
// in the server's dependency tree that names a peer dependency (required — peerDependenciesMeta's `optional` ones
// aside) expects the app to install it; electron-builder packs the server's declared dependencies and theirs, so a
// peer nobody declares is missing from the installed app though the checkout's node_modules hides it. Every such
// peer must resolve — as Node resolves it, node_modules up the tree from the package's real folder — to a package the
// server's tree packs (a `dependencies` entry of server/package.json or of a package in its tree: the kit declares
// `hono` beside `@hono/node-server`, whose peer it is). Declared somewhere in the tree isn't enough: a peer only the
// kit (a `file:` link, its own node_modules) holds can't be resolved from a package in the app's node_modules (the
// sixteenth review's s4). Required where the release is, advisory for the other apps.
function checkServerPeers(app) {
  const serverDir = join(app.dir, "server");
  const pkgPath = join(serverDir, "package.json");
  if (!existsSync(pkgPath)) return;
  const declared = new Set(Object.keys(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies || {}));
  const report = RELEASE_REQUIRED.has(app.name) ? fail : info;
  const find = (name, from) => {
    for (let d = from; ; d = dirname(d)) {
      const p = join(d, "node_modules", name, "package.json");
      if (existsSync(p)) return realpathSync(dirname(p));
      if (dirname(d) === d) return null;
    }
  };
  const seen = new Set(); // the real folders of the packages the tree packs
  const needs = []; // [peer, the package's name, its folder]
  const visit = (dir) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    let pj;
    try {
      pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      return;
    }
    const meta = pj.peerDependenciesMeta || {};
    for (const peer of Object.keys(pj.peerDependencies || {})) if (!meta[peer]?.optional) needs.push([peer, pj.name, dir]);
    for (const dep of Object.keys(pj.dependencies || {})) {
      const d = find(dep, dir);
      if (d) visit(d);
    }
  };
  for (const dep of declared) {
    const d = find(dep, serverDir);
    if (d) visit(d);
  }
  const missing = new Map(); // a peer → the packages that can't reach it
  for (const [peer, name, dir] of needs) {
    const d = find(peer, dir);
    if (d && seen.has(d)) continue;
    missing.set(peer, [...(missing.get(peer) || []), name]);
  }
  for (const [peer, by] of missing) {
    const who = [...new Set(by)];
    report(app.name, `server/package.json doesn't depend on ${peer}, a peer dependency of ${who.slice(0, 3).join(", ")}${who.length > 3 ? ` and ${who.length - 3} more` : ""} — the installed app's server wouldn't have it (electron-builder packs declared dependencies)`);
  }
}

// NODE_USE_SYSTEM_CA set to 1: `set NODE_USE_SYSTEM_CA=1` (cmd), `NODE_USE_SYSTEM_CA=1` or the template's
// `NODE_USE_SYSTEM_CA="${NODE_USE_SYSTEM_CA:-1}"` (a value the user set kept, else 1) in sh.
const SETS_SYSTEM_CA = /\bNODE_USE_SYSTEM_CA=(?:1\b|"?\$\{NODE_USE_SYSTEM_CA:-1\}"?)/;

// The headless launcher (§Q.3): build/launcher/ holds a <name>-server launcher, the installer
// copies it beside the exe, and no launcher shares the app executable's name — Windows resolves a
// bare name to the GUI exe first (JustVoice's CreateProcessW infinite-window trap).
function checkLauncher(app) {
  const name = app.name;
  const launchDir = join(app.dir, "build", "launcher");
  const launchers = existsSync(launchDir) ? readdirSync(launchDir) : [];
  if (!launchers.some((f) => basename(f, extname(f)).endsWith("-server"))) {
    fail(name, "build/launcher/ has no <name>-server launcher — headless is the app's own exe run as Node (§Q.3)");
  }
  // macOS and Linux: the shell script twin (the template's, 2026-10-19) — required where the release is —
  // and executable in git (Windows' git records a new file 100644: the builds would pack it not runnable)
  const script = launchers.find((f) => f.endsWith("-server") && !extname(f));
  const required = RELEASE_REQUIRED.has(name) ? fail : info;
  if (!script) {
    required(name, "build/launcher/ has no <name>-server shell script — the headless server on macOS and Linux (the template's; §Q.3)");
  } else {
    const r = spawnSync("git", ["-C", app.dir, "ls-files", "-s", "--", `build/launcher/${script}`], { encoding: "utf8" });
    const mode = r.status === 0 ? r.stdout.split(" ")[0] : "";
    // a git checkout that doesn't track it (a new app before its first add) builds it without the bit too
    if (r.status === 0 && !mode) required(name, `build/launcher/${script} isn't in git — add it executable: git add ${script}; git update-index --chmod=+x build/launcher/${script} (§Q.3)`);
    else if (mode && mode !== "100755") required(name, `build/launcher/${script} is ${mode} in git, not executable — git update-index --chmod=+x build/launcher/${script} (§Q.3)`);
  }
  const cfg = existsSync(join(app.dir, "quasar.config.js")) ? readFileSync(join(app.dir, "quasar.config.js"), "utf8") : "";
  // path.join(root, 'build', 'launcher') or 'build/launcher'
  if (!/extraResources:\s*\[[^\]]*['"/\\]launcher\/?['"]/.test(cfg)) {
    fail(name, "quasar.config.js's builder doesn't copy build/launcher/ beside the exe (extraResources) — §Q.3");
  }
  // every launcher trusts the system's certificates (a company network's TLS inspection — Node's own list made every
  // download fail; the thirteenth review): NODE_USE_SYSTEM_CA=1, as the shell sets it for the desktop's server — in
  // the launcher's code, never only in a comment (its own: # in a shell script, rem / :: in a .cmd — the fifteenth
  // review: the JS stripping left those, so a comment naming the variable passed)
  for (const f of launchers.filter((x) => basename(x, extname(x)).endsWith("-server"))) {
    const text = launcherCode(join(launchDir, f));
    if (!SETS_SYSTEM_CA.test(text)) required(name, `build/launcher/${f} doesn't set NODE_USE_SYSTEM_CA=1 — the server on its own trusts only Node's certificates (the template's launchers)`);
  }
  const exe = (cfg.match(/executableName:\s*['"]([^'"]+)['"]/) || [])[1];
  if (!exe) fail(name, "quasar.config.js's builder.win has no executableName — the exe's name must be known to keep it apart from the launcher's (§Q.3)");
  for (const f of launchers) {
    if (exe && basename(f, extname(f)).toLowerCase() === exe.toLowerCase()) {
      fail(name, `build/launcher/${f} shares the app executable's name — Windows would run the GUI exe instead (the CreateProcessW trap, §Q.3)`);
    }
  }
}

// Cross-app: ONE biome config means byte-one — hash-compare the apps' files; and the pinned
// biome version must be the SAME exact version everywhere, the template included.
function checkSkeletonCrossApp() {
  const apps = APPS.filter((a) => a.kind === "quasar" && existsSync(join(a.dir, "biome.json")));
  const distinct = new Set(apps.map((a) => hash(join(a.dir, "biome.json"))));
  if (apps.length > 1 && distinct.size > 1) {
    fail("family", `biome.json differs between the apps (${apps.map((a) => a.name).join(" / ")}) — one config, byte-identical (P10)`);
  }
  const versions = new Set([...APPS, TEMPLATE].map((a) => {
    const p = join(a.dir, "package.json");
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).devDependencies?.["@biomejs/biome"] : undefined;
  }).filter(Boolean));
  if (versions.size > 1) fail("family", `@biomejs/biome versions differ: ${[...versions].join(" vs ")} (P10)`);
}

// Kit self: the family answers apply to this repo too.
function checkSkeletonKit() {
  if (!existsSync(join(KIT, ".gitattributes"))) fail("kit", ".gitattributes missing (P10)");
}


// ── check 9 · the family docs standard (decided 2026-08-08, docs/dev/TASKS.md) ─
// ADVISORY ON PURPOSE, and this is a judgement, not laziness: the backlog it
// measures is known and large (JustWrite ships no ai-features page and no
// troubleshooting page at all), so promoting these to fail() today would leave
// the script exiting 1 until the whole docs program lands — which is precisely
// how a gate stops being read. Promote to fail() once the reported gap is closed.
//
// What this check does NOT do, by ruling: compare prose between apps. Each app
// writes its own pages. Every failure on record was naming, coverage or accuracy
// — never cross-app wording — so nothing here hashes or diffs a page body.
const DOC_REQUIRED = ["getting-started", "ai-features", "ai-providers", "troubleshooting", "whats-new"];

// An app need not document a concept; if it does, it uses the family's name.
const DOC_RENAME = new Map([
  ["providers", "ai-providers"],
  ["ai-setup", "ai-providers"],
  ["backup-restore", "backups-and-data"],
  ["import-formats", "import-and-export"],
  ["export", "import-and-export"],
]);

// One topic, one page, PER APP. JustWrite documents Quick Setup twice in its own
// repo (ai-providers.md + models.md) — the duplication a cross-app check can
// never see, and the reason this one is scoped inside an app.
const DOC_TOPICS = new Map([
  ["Quick Setup", /^quick setup\b/],
  ["routing by feature", /\brouting (by )?features?\b/],
  ["the model catalog", /\bmodel catalog\b/],
]);

const docSlugs = (dir) => (existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => basename(f, ".md"))
  : []);
const normHeading = (h) => h.replace(/[—–:].*$/, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

function readToc(app) {
  const p = join(app.dir, "docs/toc.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function checkDocs(app) {
  const dir = join(app.dir, "docs");
  const slugs = docSlugs(dir);
  if (!slugs.length) return;

  // Renames first: a page that exists under the wrong name is ONE finding, not
  // two. Reporting "ai-providers.md missing" beside "providers.md should be
  // ai-providers.md" doubles the noise and overstates the gap.
  const renamesTo = new Set();
  for (const slug of slugs) {
    const canonical = DOC_RENAME.get(slug);
    if (!canonical) continue;
    renamesTo.add(canonical);
    info(app.name, `docs/${slug}.md — the family name for this page is ${canonical}.md`);
  }
  for (const want of DOC_REQUIRED) {
    if (slugs.includes(want) || renamesTo.has(want)) continue;
    info(app.name, `docs/${want}.md missing — family required page (docs standard)`);
  }

  const toc = readToc(app);
  if (!toc) { info(app.name, "docs/toc.json missing or unparseable"); return; }
  // JW keys its groups `section`, JV/docgen `group` — both are named groups.
  // (The first run of this check misread JW's key and reported 5 unnamed
  // groups that were named all along — a checker bug, not a docs gap.)
  const unnamed = toc.filter((g) => !String(g.group || g.section || "").trim()).length;
  if (unnamed) info(app.name, `docs/toc.json has ${unnamed} unnamed group(s) — groups carry names in every app`);

  // one topic, one page
  const byTopic = new Map();
  for (const slug of slugs) {
    const src = readFileSync(join(dir, `${slug}.md`), "utf8");
    for (const line of src.split("\n")) {
      if (!line.startsWith("## ")) continue;
      const h = normHeading(line.slice(3));
      for (const [topic, re] of DOC_TOPICS) {
        if (!re.test(h)) continue;
        if (!byTopic.has(topic)) byTopic.set(topic, new Set());
        byTopic.get(topic).add(slug);
      }
    }
  }
  for (const [topic, pages] of byTopic) {
    if (pages.size > 1) info(app.name, `"${topic}" is documented in ${pages.size} pages — ${[...pages].join(", ")} (one topic, one page)`);
  }
}

// A slug must mean the same thing everywhere. The toc TITLE is the derivable
// signal: JustVoice's `presets` was titled "Render presets" (audio) while
// JustWrite's is the LLM preset bar — same filename, different subject (JV's
// renamed to render-presets, 2026-08-08). Title comparison is a PROXY — an
// app-voiced title over the SAME subject is legitimate, so ruled cases live in
// TITLE_ALLOW with the reason, same contract as ALLOW above.
const TITLE_ALLOW = new Map([
  ["ai-providers", "same subject, app-voiced: JV's page genuinely covers TTS providers too; docgen's is its first-run setup door (2026-08-08)"],
]);
function checkDocsCrossApp() {
  const titles = new Map();
  for (const app of APPS) {
    for (const group of readToc(app) || []) {
      for (const item of group.items || []) {
        if (!titles.has(item.slug)) titles.set(item.slug, new Map());
        titles.get(item.slug).set(app.name, item.title);
      }
    }
  }
  for (const [slug, perApp_] of titles) {
    if (perApp_.size < 2) continue;
    if (TITLE_ALLOW.has(slug)) continue;
    const distinct = new Set([...perApp_.values()].map((t) => normHeading(t)));
    if (distinct.size > 1) {
      const shown = [...perApp_].map(([a, t]) => `${a}="${t}"`).join(" vs ");
      info("family", `slug "${slug}" carries different titles — ${shown} (a slug means one thing family-wide)`);
    }
  }
}

// ── check 10 · a tracker item carries its decision (format ruling 2026-08-08) ──
// Twice this failed: prose that restated code and went stale, then stubs that
// dropped the decision and made a later session excavate it from a transcript.
// The format is six fields; the two that cannot be reconstructed from code are
// STATE (what was decided, in the user's words) and GO. Advisory for the same
// reason as check 9 — JustWrite's and the kit's trackers predate the ruling.
function checkTrackerFormat() {
  const trackers = [...APPS.map((a) => [a.name, join(a.dir, "docs/dev/TASKS.md")]), ["kit", join(KIT, "docs/dev/TASKS.md")]];
  for (const [name, file] of trackers) {
    if (!existsSync(file)) { info(name, "docs/dev/TASKS.md missing"); continue; }
    let heading = null;
    let body = [];
    const flush = () => {
      if (!heading) return;
      const text = body.join("\n");
      const missing = ["STATE", "GO"].filter((f) => !new RegExp(`^${f}:`, "m").test(text));
      if (missing.length) info(name, `TASKS.md item "${heading.slice(0, 60)}" has no ${missing.join(" / ")} line (format ruling)`);
    };
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("### ")) { flush(); heading = line.slice(4).trim(); body = []; }
      else if (line.startsWith("## ")) { flush(); heading = null; body = []; }
      else if (heading) body.push(line);
    }
    flush();
  }
}

// ── check 15 · research lands in the register (decided 2026-10-04) ─────────────
// The day this was born, four review agents re-read JustVoice's code to learn
// that installing a model restarts its speech runtime — written three days
// earlier as one bullet in a 376-line plan doc that nothing pointed at. The rule
// (app-structure §13): every repo keeps docs/dev/RESEARCH.md, organised by
// subject; research is not done until its facts are there. This check can see
// the LINK, not that the facts came with it — that half stays the rule. Plans
// dated before the rule are indexed by hand, not policed.
const RESEARCH_SINCE = "2026-10-04";

function checkResearchRegister(name, repoDir) {
  const reg = join(repoDir, "docs/dev/RESEARCH.md");
  if (!existsSync(reg)) { fail(name, "docs/dev/RESEARCH.md missing — the research register (app-structure §13)"); return; }
  const text = readFileSync(reg, "utf8");
  const plans = join(repoDir, "docs/plans");
  for (const f of existsSync(plans) ? readdirSync(plans) : []) {
    const m = /^(\d{4}-\d{2}-\d{2})-.+\.md$/.exec(f);
    if (!m || m[1] < RESEARCH_SINCE) continue;
    if (!text.includes(f)) fail(name, `docs/plans/${f} is not linked from docs/dev/RESEARCH.md — research lands in the register`);
  }
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const path = target.split("#")[0];
    if (!path || /^(https?|mailto):/.test(path)) continue;
    if (!existsSync(resolve(dirname(reg), decodeURIComponent(path)))) {
      fail(name, `docs/dev/RESEARCH.md links ${target}, which does not exist`);
    }
  }
}

// ── check 11 · app code never owns a task lifecycle (AI-call convention, §8) ──
// The day this was born (2026-08-08): 17 hand-managed task sites in JustVoice,
// every finish() bare, no LLM task ever showed a token — while the server
// returned usage on every response. The convention: app code calls the kit
// runners (runAiFeature / withAiTask / runAiEndpoint) and never CREATES a task
// itself. READING the store is free and common (App.vue's global stack, the
// modals that hand their inline AiTaskStrip its task, dashboards, guards) — the
// first draft of this check flagged imports and immediately proved 19 of 23
// flagged files were readers, so the crime is the CALL, not the import:
// `<store>.start({` in a file that imports the store. `.start()` without an
// object stays legal (job-channel objects like an engine download task have
// their own start()).
const TASK_START_ALLOW = new Map([
  // "App/file" → the human ruling. EMPTY is the healthy state; an entry means
  // a ruled exception, and a growing list means call sites are dodging the
  // runners, not that the code is fine.
]);

function checkTaskLifecycle(app, files) {
  for (const f of files) {
    if (!/\.(vue|js)$/.test(f) || f.includes(".test.")) continue;
    const src = readFileSync(f, "utf8");
    if (!/useAiTasksStore/.test(src) || !/\.start\(\{/.test(src)) continue;
    const rel = relative(app.dir, f).replaceAll("\\", "/");
    if (TASK_START_ALLOW.has(`${app.name}/${rel}`)) continue;
    fail(app.name, `${rel} starts a task on useAiTasksStore directly — lifecycles belong to the kit runners withAiTask/runAiEndpoint/runAiFeature (app-structure §8, AI-call convention)`);
  }
}

// ── run ───────────────────────────────────────────────────────────────────────
const exports_ = kitExports();
const kitFiles = new Map();
for (const f of walk(join(KIT, "packages/ui/src"))) kitFiles.set(basename(f), f);

// ── check 16 · words go through vue-i18n (app-structure §Q.11; the i18n plan, Task 2) ────────
// Every app — the template included — installs vue-i18n the way Quasar's i18n preset does (a boot
// file named 'i18n' in quasar.config.js), starts its catalog from the kit's (kitMessages()), and
// has Quasar's own words follow the language (the kit's followQuasarLang). The kit's old side
// doors, deleted in Task 1, must not come back in an app's code. The i18n lint is the family's
// one file, byte-identical to the kit's packages/ui/eslint.i18n.config.js: compared wherever an app has
// one. An app WITHOUT one is advisory for now — docgen gets its file in the plan's Task 4 and
// JustVoice in Task 5; promote that line to fail() once both have it, as check 9's note says of
// its own advisories.
const I18N_DOORS = /\b(configureFamilyLabels|setUiLocale|FAMILY_LABELS|familyLabels|quickSetupCopy|catalogCopy|configureDialog)\b/;
const KIT_I18N_LINT = join(KIT, "packages", "ui", "eslint.i18n.config.js");
function checkI18n(app, files) {
  const name = app.name;
  const read = (rel) => (existsSync(join(app.dir, rel)) ? readFileSync(join(app.dir, rel), "utf8") : null);
  const pkg = JSON.parse(read("package.json") || "{}");
  if (!{ ...pkg.dependencies, ...pkg.devDependencies }["vue-i18n"]) fail(name, `package.json has no "vue-i18n" dependency — the app's words go through vue-i18n (§Q.11)`);
  const boot = (read("quasar.config.js") || "").match(/\bboot:\s*\[([^\]]*)\]/);
  if (!boot || !/['"]i18n['"]/.test(boot[1])) fail(name, "quasar.config.js's boot list has no 'i18n' — the instance is installed by src/boot/i18n.js (§Q.11)");
  const bootFile = read("src/boot/i18n.js");
  if (bootFile === null) fail(name, "src/boot/i18n.js missing — the boot file that app.use()s the vue-i18n instance (§Q.11)");
  else if (!/followQuasarLang\(/.test(bootFile)) fail(name, "src/boot/i18n.js doesn't call the kit's followQuasarLang — Quasar's own words would stay English (§Q.11)");
  const index = read("src/i18n/index.js");
  if (index === null || !/kitMessages\(\)/.test(index)) fail(name, "src/i18n/index.js doesn't start the catalog from the kit's (kitMessages()) — the kit's screens would show raw keys (§Q.11)");
  for (const file of files) {
    if (!/\.(js|vue)$/.test(file)) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(I18N_DOORS);
      if (m) fail(name, `${file.slice(app.dir.length + 1).replace(/\\/g, "/")}:${i + 1} names ${m[1]} — removed in the i18n plan's Task 1; words go through vue-i18n (§Q.11)`);
    });
  }
  const lint = join(app.dir, "eslint.i18n.config.js");
  if (!existsSync(lint)) info(name, "no eslint.i18n.config.js — the family's i18n lint, a copy of the kit's packages/ui/eslint.i18n.config.js (§Q.11)");
  else if (hash(lint) !== hash(KIT_I18N_LINT)) fail(name, "eslint.i18n.config.js differs from the kit's packages/ui/eslint.i18n.config.js — one file, byte-identical (§Q.11)");
}
function checkI18nKit() {
  if (!existsSync(KIT_I18N_LINT)) fail("kit", "packages/ui/eslint.i18n.config.js missing — the family's i18n lint (§Q.11)");
  for (const file of walk(join(KIT, "packages", "ui", "src"))) {
    if (!/\.(js|vue)$/.test(file)) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(I18N_DOORS);
      if (m) fail("kit", `packages/ui/src/${file.slice(join(KIT, "packages", "ui", "src").length + 1).replace(/\\/g, "/")}:${i + 1} names ${m[1]} — removed in the i18n plan's Task 1 (§Q.11)`);
    });
  }
}

// ── check 17 · an AI task shows where it was started (app-structure §8) ───────────────────────
// The kit's global stack (AiTaskStack, mounted by <LlmUiHosts />) shows every running task no
// screen shows, so no task is ever invisible. This check holds each app to the better half: the
// screen that starts a feature shows its progress there — the kit's AiTaskStrip, its task found
// with useSurfaceTask("<feature>") — or, for a page that shows all its runs, useSurfaceTasks([…]) /
// <AiTaskStrips :features="[…]">. Found 2026-10-18: just-house-paint's house page ran every job
// with no progress on screen, and the template's own AI example said "the task strip shows it"
// with no strip mounted — the standard lived only in §8's prose.
// The features an app starts are read from its code: every literal `feature: "…"`, and the
// `action: "…"` of a file that calls runAiFeature (its feature defaults to the action). A key
// built at run time can't be followed (advisory). It FAILS for the template, the apps made from
// it and JustWrite (adopted 2026-10-19); JustVoice and docgen, which predate useSurfaceTask, get
// advisories until their sessions adopt it — then promote them to fail(), as check 16 did.
const SURFACE_TASK_REQUIRED = new Set(["template", "just-house-paint", "JustWrite"]);
function checkSurfaceTasks(app, files) {
  const started = new Map(); // feature → the first file that starts it
  const shown = new Set();
  const sources = files
    .filter((f) => /\.(vue|js)$/.test(f) && !f.includes(".test.") && !f.includes("worker-bundle")) // a generated bundle repeats the sources
    .map((f) => [f, readFileSync(f, "utf8")]);
  // A feature may be named by a string constant (`export const PLANNING_FEATURE = "planning"` in
  // JustWrite's planningDraft.js, used by its pages too): the app's constants, by name.
  const constants = new Map();
  for (const [, src] of sources)
    for (const m of src.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*["'`]([\w.:-]+)["'`]/g)) constants.set(m[1], m[2]);
  for (const [f, src] of sources) {
    const rel = relative(app.dir, f).replaceAll("\\", "/");
    for (const m of src.matchAll(/useSurfaceTask\(\s*(?:["'`]([\w.:-]+)["'`]|([A-Z][A-Z0-9_]*)\b)/g)) {
      const k = m[1] ?? constants.get(m[2]);
      if (k) shown.add(k);
    }
    // the plural: useSurfaceTasks(["a", "b"]) and <AiTaskStrips :features="['a', 'b']"> (JustVoice's pattern)
    for (const m of src.matchAll(/useSurfaceTasks\(\s*\[([^\]]*)\]|<AiTaskStrips\b[^>]*:features="\[([^\]]*)\]"/g))
      for (const k of (m[1] ?? m[2]).matchAll(/["'`]([\w.:-]+)["'`]/g)) shown.add(k[1]);
    const keys = [...src.matchAll(/\bfeature:\s*["'`]([\w.:-]+)["'`]/g)].map((m) => m[1]);
    for (const m of src.matchAll(/\bfeature:\s*([A-Z][A-Z0-9_]*)\b/g)) if (constants.has(m[1])) keys.push(constants.get(m[1]));
    // runAiFeature's feature defaults to its action — unless the call names its feature (2026-10-18:
    // `action: "premiseDraft", feature: PLANNING_FEATURE` runs the task "planning")
    if (/\brunAiFeature(Stream)?\s*\(/.test(src))
      for (const m of src.matchAll(/\baction:\s*["'`]([\w.:-]+)["'`]/g)) {
        const call = src.slice(src.lastIndexOf("{", m.index), src.indexOf("}", m.index) + 1);
        if (!/\bfeature:/.test(call)) keys.push(m[1]);
      }
    for (const k of keys) if (!started.has(k)) started.set(k, rel);
    if (/\bfeature:\s*`[^`]*\$\{/.test(src)) info(app.name, `${rel} builds an AI task's feature key at run time — check 17 can't see whether its screen shows it; name the key as a literal`);
  }
  for (const [feature, rel] of started) {
    if (shown.has(feature)) continue;
    const msg = `${rel} starts the AI task "${feature}" but no screen shows it in place — mount the kit's AiTaskStrip with useSurfaceTask("${feature}") where the user starts it, or <AiTaskStrips :features="[…]"> for a page's runs (app-structure §8)`;
    if (SURFACE_TASK_REQUIRED.has(app.name)) fail(app.name, msg);
    else info(app.name, msg);
  }
}

// ── check 18 · the chrome a generated app carries (the template audit, 2026-10-18) ──────────────
// Standards the audit found living as prose (docs/plans/2026-10-18-template-audit.md), made
// checkable: each help button's page exists; the once-ever AI offer has a call site; the chrome is
// mounted (LlmUiHosts, HelpDrawer, AiStatusButton) and boot installs error reporting; the kit's
// fonts are listed (the font picker offers them all); numbers and dates follow the app's language
// (vue-i18n's n()/d() or a formatter given i18n's locale — never a bare toLocale*String() or
// Intl.*Format(undefined); one that names its locale, as a prompt's "en-US" does, is the app's
// choice). FAILS for the template and the apps made from it; advisory for the older apps (each has
// its own way for some of these).
const CHROME_REQUIRED = new Set(["template", "just-house-paint"]);
function checkChrome(app, files) {
  const report = (msg) => (CHROME_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  const src = files.filter((f) => /\.(vue|js)$/.test(f) && !f.includes(".test.") && !f.includes("worker-bundle"));
  const read = (f) => readFileSync(f, "utf8");
  const all = src.map((f) => [f, read(f)]);
  const rel = (f) => relative(app.dir, f).replaceAll("\\", "/");
  // help pages
  for (const [f, text] of all)
    for (const m of text.matchAll(/(?<![:\w-])help-key="([\w-]+)"/g))
      if (!existsSync(join(app.dir, "docs", `${m[1]}.md`))) report(`${rel(f)} opens help "${m[1]}" but docs/${m[1]}.md doesn't exist (§14)`);
  // the once-ever AI offer
  if (!all.some(([f, text]) => /maybeOfferAiSetup\(/.test(text) && !/stores[/]ui\.js$/.test(f)))
    report("nothing calls maybeOfferAiSetup() — the once-ever AI offer never shows (§11; the template calls it from its example page)");
  // the chrome
  const joined = all.map(([, t]) => t).join("\n");
  for (const tag of ["LlmUiHosts", "HelpDrawer", "AiStatusButton"])
    if (!new RegExp(`<${tag}\\b`).test(joined)) report(`no <${tag}> mounted — the family chrome (§4, §11)`);
  if (!/installErrorReporting\(/.test(joined)) report("boot never calls installErrorReporting() (§15)");
  // the kit's fonts
  const qconf = join(app.dir, "quasar.config.js");
  if (existsSync(qconf) && !/@delebash\/ui\/common\/fonts\.css/.test(read(qconf)))
    report("quasar.config.js doesn't list '~@delebash/ui/common/fonts.css' — the Appearance font picker's fonts aren't bundled (§11)");
  // numbers and dates in the app's language
  for (const [f, text] of all) {
    if (/\.toLocale(Date|Time)?String\(\s*(\)|undefined\b)/.test(text)) report(`${rel(f)} formats with toLocale*String() — the browser's language, not the app's; use vue-i18n's n()/d() (§Q.11)`);
    if (/Intl\.\w+Format\(\s*undefined/.test(text)) report(`${rel(f)} builds an Intl formatter for the browser's language — pass i18n's locale (§Q.11)`);
  }
}

// ── check 19 · the release (the template audit, 2026-10-18: "no self-update in the template") ─────
// An installed app updates itself only from a feed (app-structure §1, `updates`): electron-builder
// writes latest*.yml from the builder's `publish` config, and the release workflow attaches it and
// the .blockmaps to the tag's GitHub release with the installers. The template carries the release
// (.github/workflows/release.yml, manual only as JustWrite's; scripts/release.js and bump.js; the
// `publish` config); an app turns `updates` on with its first release, and its releasesUrl must name
// the repository the feed is published to. FAILS for the template and the apps made from it;
// advisory for the older apps (JustWrite's workflow predates the feed; JustVoice's runs on a tag).
const RELEASE_REQUIRED = new Set(["template", "just-house-paint"]);

// ── CORS for the app's own origins only ───────────────────────────────────────
// CORS for every origin, with loopback skipping auth, let any web page the user opened read this computer's
// server — backups with the AI keys, the tokens (the security review, 2026-10-19: reproduced). The template
// answers APP_ORIGINS and the Capacitor origins only; required where the release is, advisory elsewhere.
function checkCorsOrigins(app) {
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  for (const f of walk(join(app.dir, "server", "src")).filter((p) => p.endsWith(".js"))) {
    const code = codeOf(f);
    if (!/\bstarletteCors\s*\(/.test(code)) continue;
    // "*" anywhere in the list, a list named elsewhere that holds "*", or a regex that matches anything
    const named = [...code.matchAll(/allowOrigins:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const namedStar = named.some((n) => new RegExp(`\\b(?:const|let|var)\\s+${n}\\s*=\\s*\\[[^\\]]*["'\`]\\*["'\`]`).test(code));
    if (/allowOrigins:\s*\[[^\]]*["'`]\*["'`]/.test(code) || namedStar || /allowOriginRegex:\s*["'`]\^?\.[*+]/.test(code))
      report(`${relative(app.dir, f).replace(/\\/g, "/")} allows CORS from every origin — any web page could read this computer's server; answer the app's own origins (the template's APP_ORIGINS + CAPACITOR_ORIGINS)`);
  }
}

// ── a restore keeps the server's access tokens ────────────────────────────────
// The tokens are the server's, not the data's: a restore that brings a backup's `auth` row — or none —
// opens an exposed headless server, or locks every client out (the template's data_admin.js `keepAuth`,
// 2026-10-19). Checked where the tokens live in the settings table (auth.js reads the "auth" row);
// required where the release is, advisory elsewhere until each app takes it.
function checkRestoreKeepsTokens(app) {
  const src = join(app.dir, "server", "src");
  const auth = join(src, "auth.js");
  // getSetting(db, "auth") (the template's), getSetting("auth") (docgen's), h.get("settings", "auth") (JustWrite's)
  if (!existsSync(auth) || !/(getSetting\([^)]*|["']settings["']\s*,\s*)["']auth["']/.test(readFileSync(auth, "utf8"))) return;
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  for (const f of walk(src).filter((p) => p.endsWith(".js"))) {
    const y = codeOf(f); // a comment naming afterCopy keeps nothing
    if (/\bmakeDataRouter\s*\(/.test(y) && !/\bafterCopy\s*[:(]/.test(y))
      report(`${relative(app.dir, f).replace(/\\/g, "/")}: a restore replaces the access tokens with the backup's (or none) — keep this server's (the template's data_admin.js keepAuth: beforeCopy / afterCopy)`);
  }
}
// ── a restore shuts the other writes out ──────────────────────────────────────
// While a restore or a reset replaces the data, a write from another window answered 200 and was lost, or landed
// over the restored data (just-house-paint's eleventh review, 2026-10-20): the app mounts the kit's
// MaintenanceGate before its routes and hands it to makeDataRouter, with its teardown as `beforeReplace`.
// Required where the release is, advisory elsewhere until each app takes it.
function checkMaintenanceGate(app) {
  const src = join(app.dir, "server", "src");
  if (!existsSync(src)) return;
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  const code = walk(src)
    .filter((p) => p.endsWith(".js"))
    .map((f) => [f, codeOf(f)]);
  const routers = code.filter(([, y]) => /\bmakeDataRouter\s*\(/.test(y));
  if (!routers.length) return;
  if (!code.some(([, y]) => /\.use\(\s*["']\*["']\s*,\s*\w+\.middleware\(\s*\)\s*\)/.test(y) && /\bnew\s+MaintenanceGate\s*\(/.test(y)))
    report("server/src: no maintenance gate before the routes — a write during a restore is lost (the template's app.js: new MaintenanceGate, app.use(\"*\", gate.middleware()))");
  for (const [f, y] of routers) {
    const where = relative(app.dir, f).replace(/\\/g, "/");
    if (!/\bgate\s*[,}:]/.test(y)) report(`${where}: makeDataRouter without the app's gate — its restore never shuts the other writes out (the template's data_admin.js)`);
    if (!/\bbeforeReplace\s*:/.test(y)) report(`${where}: makeDataRouter without beforeReplace — the app's jobs run on while the data is replaced (the template's data_admin.js)`);
  }
}
// ── the built UI through the kit's serveUi ────────────────────────────────────
// Every app served its built UI with its own block — a write to an unknown /v1 path answered 405, no validator or cache
// rule on any file, an index.html a browser could keep past an update (just-house-paint's twentieth review,
// 2026-10-20). The kit's platform serveUi is the one copy: an app's server that mounts serveStatic on "/*" itself is
// told so. Required where the release is, advisory elsewhere until each app takes it.
function checkServesUi(app) {
  const src = join(app.dir, "server", "src");
  if (!existsSync(src)) return;
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  for (const f of walk(src).filter((p) => p.endsWith(".js"))) {
    if (/\.(?:get|use)\(\s*["']\/\*["']\s*,\s*serveStatic\s*\(/.test(codeOf(f)))
      report(`${relative(app.dir, f).replace(/\\/g, "/")} serves its built UI by hand — the kit's serveUi(app, uiDir) (@delebash/core/platform): 405 with Allow, an unknown /v1 write the API's 404, ETags, hashed assets kept`);
  }
}
// ── the connection page says why ──────────────────────────────────────────────
// The shell's serverStatus names why the server didn't start (2026-10-20, the thirteenth review): another OS user's
// copy on the port, a port Windows reserved, the server's own first error — the app's connection page says each.
function checkConnectionReasons(app) {
  const page = join(app.dir, "src", "pages", "ConnectionErrorPage.vue");
  if (!existsSync(page)) return;
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  const y = codeOf(page);
  const missing = ["portOtherUser", "portReserved", "serverError"].filter((k) => !new RegExp(`\\b${k}\\b`).test(y));
  if (missing.length) report(`src/pages/ConnectionErrorPage.vue doesn't say the shell's ${missing.join(", ")} — the template's page shows how`);
}
function checkRelease(app) {
  const report = (msg) => (RELEASE_REQUIRED.has(app.name) ? fail : info)(app.name, msg);
  const workflow = join(app.dir, ".github", "workflows", "release.yml");
  if (!existsSync(workflow)) report("no .github/workflows/release.yml — the template's release (installers + the update feed, manual only)");
  else {
    const y = readFileSync(workflow, "utf8");
    if (!/^\s*workflow_dispatch:/m.test(y) || /^\s*(push|pull_request):/m.test(y))
      report(".github/workflows/release.yml must start only by hand (workflow_dispatch — JustWrite's release system), never on a push or tag");
    if (!/latest\*\.yml/.test(y) || !/\*\.blockmap/.test(y))
      report(".github/workflows/release.yml doesn't attach electron-updater's feed (latest*.yml, *.blockmap) — an installed copy can't update (§1 `updates`)");
    // the kit moves on with every app's work: a release builds the kit's commit the app was tested with
    if (!/repository:\s*delebash\/just-core[\s\S]*?ref:\s*\$\{\{\s*inputs\.core_ref\s*\}\}|ref:\s*\$\{\{\s*inputs\.core_ref\s*\}\}[\s\S]*?repository:\s*delebash\/just-core/.test(y))
      report(".github/workflows/release.yml checks the kit out at its main — check it out at `inputs.core_ref` (the commit the app was tested with; the template's release.js passes it)");
    // the start checks read without the YAML's comments (a commented-out step checks nothing), each line on its own
    const steps = y
      .split(/\r?\n/)
      .map((line) => line.replace(/(^|\s)#.*$/, ""))
      .filter((line) => /node scripts\/start-packaged\.js/.test(line));
    // the packaged app must start on each runner before anything is attached (macOS and Linux are never opened by hand) —
    // its window, not only its server
    if (!steps.some((line) => !/--headless/.test(line)))
      report(".github/workflows/release.yml doesn't start the packaged app's window before attaching it (the template's \"Start the packaged app\" step, scripts/start-packaged.js)");
    // and its server on its own, through the launcher the help names (macOS and Linux have one since 2026-10-19)
    if (!steps.some((line) => /--headless/.test(line)))
      report(".github/workflows/release.yml doesn't start the server on its own through the app's launcher (the template's \"Start the server on its own\" step, start-packaged.js --headless)");
    // a check that may fail and the release go on isn't one
    if (/^\s*continue-on-error:\s*true/m.test(y.replace(/(^|\s)#.*$/gm, "")))
      report(".github/workflows/release.yml lets a step fail and go on (continue-on-error: true) — every check must stop the release");
  }
  for (const rel of ["scripts/release.js", "scripts/bump.js", "scripts/start-packaged.js"]) if (!existsSync(join(app.dir, rel))) report(`no ${rel} (the template's)`);
  const pkgPath = join(app.dir, "package.json");
  const scripts = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).scripts || {} : {};
  for (const name of ["bump", "release"]) if (!scripts[name]) report(`package.json has no "${name}" script (the template's scripts/${name}.js)`);
  const qconf = join(app.dir, "quasar.config.js");
  const q = existsSync(qconf) ? readFileSync(qconf, "utf8") : "";
  // electron-builder takes `publish` as one object or a list of them (its docs, "Publish"): the GitHub one in either
  const pub = q.match(/publish:\s*\[?\s*(?:\{[^}]*\}\s*,\s*)*\{[^}]*provider:\s*['"]github['"][^}]*owner:\s*['"]([\w.-]+)['"][^}]*repo:\s*['"]([\w.-]+)['"]/);
  if (!pub) report("quasar.config.js's electron builder has no GitHub `publish` config — electron-builder writes no update feed (§1 `updates`)");
  // the feed names each file as electron-builder wrote it, with spaces as hyphens; GitHub stores an
  // uploaded name's spaces as dots — a product name with a space in the file name breaks every update
  else if (!/artifactName:\s*['"`][^'"`\s]*['"`]/.test(q) || /artifactName:.*productName/.test(q))
    report("quasar.config.js's electron builder needs an `artifactName` without spaces (the template's `${name}-${version}-${os}-${arch}.${ext}`) — the update feed would name files GitHub doesn't have");
  const mainPath = join(app.dir, "src-electron", "electron-main.js");
  const main = existsSync(mainPath) ? readFileSync(mainPath, "utf8") : "";
  const rel = main.match(/releasesUrl:\s*["'`]https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases["'`]/);
  if (rel && pub && (rel[1] !== pub[1] || rel[2] !== pub[2]))
    report(`src-electron/electron-main.js checks ${rel[1]}/${rel[2]} for updates, but the feed is published to ${pub[1]}/${pub[2]}`);
}

const perApp = [];
// ── check 20 · modern ES modules everywhere (the family rules, 2026-10-24) ─────────────────────────
// `.js` files with standard `import` — app and kit code, scripts, tests and tools alike: a `require(`, a
// `createRequire` or an `.mjs`/`.cjs` file fails. The only CommonJS is what a platform forces (ESM_PLATFORM, each
// with its doc). JustWrite's and JustVoice's files from before the rule are listed by name (ESM_KNOWN) and printed
// until their sessions convert them — a file leaves the list when it's converted; any other file fails. Comment
// lines aren't code.
const ESM_PLATFORM = new Map([
  ["packages/core/src/shell/preload.js", "Electron's sandboxed preload is CommonJS — electronjs.org/docs/latest/tutorial/esm"],
  ["src-capacitor/capacitor.config.js", "Capacitor's .js config loader takes no ES module — quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor"],
]);
const ESM_KNOWN = new Map([
  ["JustVoice", new Set([
    "scripts/mock-snapshots.js",
    "scripts/node24.js",
    "scripts/smoke.js",
    "scripts/smoke_gui.js",
    "server/src/engines/leftovers.js",
  ])],
]);
const ESM_SKIP = new Set(["node_modules", "dist", ".git", "build", "out", ".quasar", "android", "ios", "www", "coverage", "target", ".venv", "__pycache__", "data"]);
function walkAll(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (ESM_SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkAll(full, out);
    else out.push(full);
  }
  return out;
}
const REQUIRE = /\brequire\s*\(|\bcreateRequire\b/;
function checkEsModules(name, dir, roots = ["."]) {
  const files = notIgnored(dir, roots.flatMap((r) => walkAll(join(dir, r))));
  for (const f of files) {
    const rel = relative(dir, f).replace(/\\/g, "/");
    if (/\.(mjs|cjs)$/.test(rel)) {
      fail(name, `${rel} is an .mjs/.cjs file — the family's code is .js ES modules (family rules)`);
      continue;
    }
    if (!/\.(js|vue)$/.test(rel) || ESM_PLATFORM.has(rel)) continue;
    if (name === "kit" && rel === "scripts/check-family.js") continue; // REQUIRE above is this check's own pattern, not a use
    const code = readFileSync(f, "utf8").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    if (!REQUIRE.test(code)) continue;
    if (ESM_KNOWN.get(name)?.has(rel)) info(name, `${rel} uses require — known since 2026-10-24; its session converts it to an ES import (family rules)`);
    else fail(name, `${rel} uses require/createRequire — the family's code is ES modules: a standard import, await import() or import.meta.resolve() (family rules)`);
  }
}

// ── check 21 · every AI engine goes through the kit, the way llama.cpp does (the family rules, 2026-10-24) ──
// An app's server doing an engine's job itself fails: starting a native process (node:child_process, the kit's
// spawnChild/closeJob), unpacking an engine's archive or acquiring a runtime (the kit's zip / tar / acquireRuntime),
// opening ONNX Runtime, or pinning a model file by its SHA-256 outside its seed files (database/seed*.js,
// seed_*.js). The kit's runtimes do these (docs/plans/2026-10-24-engines-the-llama-way.md). The files that did
// it before the rule are listed by name (ENGINE_KNOWN) and printed until their round moves them into the kit;
// any other file fails.
const ENGINE_SIGNS = [
  [/from\s+["']node:child_process["']|from\s+["']child_process["']/, "starts a process (node:child_process)"],
  [/\b(spawnChild|closeJob)\b/, "starts a native process (the kit's spawnChild)"],
  [/\b(extractZip|extractTarGz|acquireRuntime)\b/, "unpacks or acquires an engine itself"],
  [/from\s+["']onnxruntime-(node|web)["']|import\(\s*["']onnxruntime-(node|web)["']\s*\)/, "opens ONNX Runtime itself"],
  [/["'`][0-9a-f]{64}["'`]/, "pins a file by its SHA-256 in code"],
];
const ENGINE_KNOWN = new Map([
  ["just-house-paint", new Set([
    "server/src/aiphoto/engine.js",
    "server/src/aiphoto/sdcli.js",
    "server/src/finder.js",
    "server/src/segment/models.js",
    "server/src/segment/segmenter.js",
  ])],
  ["JustVoice", new Set([
    "server/src/audio/dsp_client.js",
    "server/src/engines/audiocpp/catalog.json",
    "server/src/engines/audiocpp/espeak.js",
    "server/src/engines/audiocpp/japanese.js",
    "server/src/engines/audiocpp/release.js",
    "server/src/engines/audiocpp/runtime.js",
  ])],
]);
const isSeedFile = (rel) => /(^|\/)(database\/seed[^/]*|seed_[^/]*)\.js$/.test(rel);
function checkEngines(app) {
  const root = join(app.dir, "server", "src");
  for (const f of notIgnored(app.dir, walk(root))) {
    if (!/\.(js|json)$/.test(f)) continue; // a catalog .json can pin files too
    const rel = relative(app.dir, f).replace(/\\/g, "/");
    const code = readFileSync(f, "utf8").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const what = ENGINE_SIGNS.filter(([re, why]) => re.test(code) && !(why.includes("SHA-256") && isSeedFile(rel))).map(([, why]) => why);
    if (!what.length) continue;
    const msg = `${rel} ${what.join("; ")} — AI engines go through the kit's runtimes (family rules; the engines plan)`;
    if (ENGINE_KNOWN.get(app.name)?.has(rel)) info(app.name, `${msg} — known since 2026-10-24, moves into the kit in its round`);
    else fail(app.name, msg);
  }
}

// ── check 23 · the family's page looks are the kit's (the engines plan, F5 + F6 — 2026-10-24) ─────────────────
// The kit's packages/ui/src/common/app.css holds the looks every app copied from the template's app.scss (the base,
// the shell, pages, cards, hints, forms, Settings, the AI page, the splash) — the kit's own panels use .card and
// .hint. An app that lists it in quasar.config.js `css` defines none of its classes again in src/css/app.scss (a
// rule whose selector is the bare class — `.houses .card` refines it, and is the app's); the template lists it. An
// app not on it yet is told which of its classes are the kit's (printed, not failing) until its session moves it.
const KIT_LOOKS = join(KIT, "packages", "ui", "src", "common", "app.css");
/** The classes `css` defines with a bare selector (`.card`, `.card:hover` — not `.houses .card`). */
function bareClasses(css) {
  const out = new Set();
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of plain.matchAll(/([^{}@;]+)\{/g)) {
    for (const sel of m[1].split(",")) {
      const one = /^\s*\.([a-zA-Z][\w-]*)(?::{1,2}[\w-]+(?:\([^)]*\))?)*\s*$/.exec(sel);
      if (one) out.add(one[1]);
    }
  }
  return out;
}
function checkKitLooks(app) {
  if (!existsSync(KIT_LOOKS)) return;
  const kit = bareClasses(readFileSync(KIT_LOOKS, "utf8"));
  const cfg = existsSync(join(app.dir, "quasar.config.js")) ? readFileSync(join(app.dir, "quasar.config.js"), "utf8") : "";
  const listed = /['"]~@delebash\/ui\/common\/app\.css['"]/.test(cfg);
  const sheet = join(app.dir, "src", "css", "app.scss");
  const copies = existsSync(sheet) ? [...bareClasses(readFileSync(sheet, "utf8"))].filter((c) => kit.has(c)).sort() : [];
  if (listed && copies.length) fail(app.name, `src/css/app.scss defines the kit's ${copies.map((c) => `.${c}`).join(", ")} again — it lists the kit's common/app.css; keep only the app's own looks`);
  if (listed) {
    // the page tokens the sheet reads with a fallback (tokens.contract.css, "Page tokens"): named when the app has none
    const tokens = existsSync(join(app.dir, "src", "css", "tokens.css")) ? readFileSync(join(app.dir, "src", "css", "tokens.css"), "utf8") : "";
    const sheetTokens = [...new Set([...readFileSync(KIT_LOOKS, "utf8").matchAll(/var\((--[\w-]+),/g)].map((m) => m[1]))];
    const missing = sheetTokens.filter((tk) => !new RegExp(`${tk}\\s*:`).test(tokens));
    if (missing.length) info(app.name, `src/css/tokens.css doesn't define ${missing.join(", ")} — the kit's common/app.css uses the template's values for them (tokens.contract.css, "Page tokens")`);
  }
  else if (!listed && app === TEMPLATE) fail(app.name, "quasar.config.js doesn't list ~@delebash/ui/common/app.css — the family's page looks");
  else if (!listed && copies.length) info(app.name, `src/css/app.scss copies ${copies.length} of the kit's page looks (${copies.slice(0, 6).map((c) => `.${c}`).join(", ")}${copies.length > 6 ? "…" : ""}) — list ~@delebash/ui/common/app.css before it and keep only the app's own (the engines plan, F6)`);
}

for (const app of [...APPS, TEMPLATE]) {
  if (!existsSync(app.dir)) { fail(app.name, `not found at ${app.dir}`); continue; }
  const files = notIgnored(app.dir, walk(join(app.dir, "src")));
  perApp.push([app.name, files]);
  checkForks(app, files, exports_);
  checkDrift(app, files, kitFiles);
  // the layout checks need a Quasar app; one without quasar.config.js gets one violation instead
  if (app.kind === "unknown") {
    fail(app.name, "no quasar.config.js — every family app is a Quasar app (§Q); the layout checks can't run");
  } else {
    checkScripts(app);
    checkServer(app);
    checkCommonServer(app);
    checkSkeleton(app);
    checkRendererSkeleton(app);
    checkLauncher(app);
    checkServerPeers(app);
    checkDesktopMain(app);
    checkDevPorts(app);
    checkQuasar(app);
    checkI18n(app, files);
  }
  checkHandRolled(app, files);
  checkRetired(app.name, app.dir, RETIRED.get(app.name));
  checkDocs(app);
  checkTaskLifecycle(app, files);
  checkSurfaceTasks(app, files);
  checkChrome(app, files);
  checkRelease(app);
  checkRestoreKeepsTokens(app);
  checkMaintenanceGate(app);
  checkServesUi(app);
  checkConnectionReasons(app);
  checkCorsOrigins(app);
  checkClipboard(app.name, app.dir, files, RELEASE_REQUIRED.has(app.name));
  checkOneSaveDoor(app, files);
  checkOneShellDoor(app, files);
  checkOneHono(app, [...walk(join(app.dir, "server", "src")), ...walk(join(app.dir, "server", "tests"))]);
  checkNoWindowGlobal(app, files);
  checkResearchRegister(app.name, app.dir);
  checkAgentsRules(app);
  checkEsModules(app.name, app.dir);
  checkEngines(app);
  checkKitLooks(app);
}
checkCrossAppTwins(perApp, kitFiles);
checkDocsCrossApp();
checkTrackerFormat();
checkSkeletonCrossApp();
checkRetired("kit", KIT, KIT_RETIRED);
checkSkeletonKit();
checkClipboard("kit", KIT, walk(join(KIT, "packages", "ui", "src")), true);
checkI18nKit();
checkResearchRegister("kit", KIT);
checkEsModules("kit", KIT, ["packages", "scripts", "skills"]);
// The /new-just-app skill runs from Claude Code's user skills folder (install-skills.js
// `userSkillsDir`) — advisory when that copy differs from the kit's.
// A stale installed skill makes apps from old rules (2026-10-24): a failure, not a note.
for (const d of installedSkillDrift()) fail("kit", `the installed skill ${d.name}/${d.file} differs from the kit's skills/ — run node scripts/install-skills.js`);

// ── check 22 · a plan names the kit code it uses (the family rules, 2026-10-24; scripts/check-plan.js) ──
// Every plan dated from PLAN_CHECK_SINCE in the kit or an app carries a standards table (a "Kit code" column)
// whose rows name kit code that exists, or say "app — why" or "NOT STANDARD — …".
const PLAN_CHECK_SINCE = "2026-10-25";
const planExports = planKitExports();
for (const [name, dir] of [["kit", KIT], ...[...APPS, TEMPLATE].map((a) => [a.name, a.dir])]) {
  const plans = join(dir, "docs", "plans");
  for (const f of existsSync(plans) ? readdirSync(plans) : []) {
    const m = /^(\d{4}-\d{2}-\d{2})-.+\.md$/.exec(f);
    if (!m || m[1] < PLAN_CHECK_SINCE) continue;
    const rows = checkPlanText(readFileSync(join(plans, f), "utf8"), planExports);
    if (!rows.length) fail(name, `docs/plans/${f} has no standards table (a "Kit code" column) — node scripts/check-plan.js`);
    for (const r of rows.filter((x) => x.verdict === "fail")) fail(name, `docs/plans/${f}: "${r.piece}" ${r.why}`);
  }
}

const showInfo = process.argv.includes("--info");
console.log(`\nfamily check — ${APPS.length} apps + the template against the kit (${exports_.size} kit exports)`);
console.log(`  kinds: ${[...APPS, TEMPLATE].map((a) => `${a.name} ${a.kind}`).join(" · ")}\n`);
if (problems.length) {
  console.log("VIOLATIONS\n");
  for (const p of problems) console.log(`  ✗ ${p}`);
} else {
  console.log("  ✓ no violations");
}
if (showInfo && infos.length) {
  console.log("\nADVISORY (not failures — judgement required)\n");
  for (const i of infos) console.log(`  · ${i}`);
} else if (infos.length) {
  console.log(`\n  (${infos.length} advisory findings — re-run with --info to see them)`);
}
console.log("");
process.exit(problems.length ? 1 : 0);
