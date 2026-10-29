// SPDX-License-Identifier: MIT
// The generator behind the /new-just-app skill (skills/new-just-app/SKILL.md): makes a new family
// app from template/ — app-structure §1. Deterministic steps only; the questions (the PRD
// interview, the parts) are the skill's.
//
//   node scripts/new-app.js --name house-paint [--product "Just House Paint"] [--dest DIR]
//        [--port N] [--dev-port N] [--hmr-port N] [--skip-install] [--no-register] [--dry-run]
//
// No phone app (decided 2026-10-19, the template audit): the template's src-capacitor/ is a scaffold
// with no in-app server, so a phone build of it shows only the connection page. Apps are made without
// it until the template carries the phone's server (JustWrite's src/phone/ is the reference);
// `--phone` says so, `--no-phone` is still accepted.
//
// What it does, in order (each step says what it did; nothing existing is overwritten):
//   1. names from --name (§1): repo `just-<name>`, id `just<name>` (no hyphens — Android), the
//      server package `just-<name>-server`, the data env `JUST_<NAME>_DATA_DIR`;
//   2. ports: the next free server / dev / HMR ports from the guard's registries (skipping 17496
//      and 1440, §1) unless given;
//   3. copies the template's TRACKED files (`git ls-files template`) into the destination,
//      renaming the template's names and ports and re-pointing its paths into the kit (the
//      template sits inside the kit; an app sits beside it), skipping lockfiles (regenerated) and
//      any file that already exists (reported); the template's description of itself in
//      README.md, AGENTS.md and package.json becomes the app's — the first paragraph of the PRD's
//      "What it is for" (the skill writes the PRD first), or a marked placeholder without one;
//   4. `git init` (when the folder isn't a repository yet);
//   5. installs: the root (+ the server workspace), src-electron, src-capacitor, e2e;
//   6. checks: lint, the server tests, the unit tests;
//   7. registers the app in the guard (APPS, APP_PORTS, DEV_PORTS) and runs it.
// It does not commit, and never creates a GitHub repository — the skill asks the user first.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAMILY = path.dirname(KIT);
const TEMPLATE_DIR = path.join(KIT, "template");
const GUARD = path.join(KIT, "scripts", "check-family.js");

// The template's own names (template/src-electron/electron-main.js, server/package.json).
export const TEMPLATE_NAMES = {
  serverPackage: "family-template-server",
  envPrefix: "FAMILY_TEMPLATE",
  product: "Family Template",
  appName: "FamilyTemplate",
  id: "familytemplate",
  slug: "family-template",
  snake: "family_template",
  port: 17490,
  devPort: 9000,
  mark: "FT", // the title bar's brand mark (src/i18n/locales/en.json app.mark)
};

// Ports never handed out (§1): JW's smoke scratch port (17496), eval (17497), flow tests (17498) and screenshot
// import (17504), and JV's second renderer.
const RESERVED = new Set([17496, 17497, 17498, 17504, 1440, 1441]);

const BINARY = /\.(png|jpe?g|gif|ico|icns|webp|woff2?|ttf|otf|jar|keystore|zip|gz|bin|exe|dll|so|dylib|node|wasm|mp3|wav|ogg|pdf)$/i;
const LOCKFILE = /(^|\/)package-lock\.json$/;

/** The PRD's purpose: the first paragraph under "## What it is for" — null when there is none, or
 *  when it is still the template's italic placeholder. */
export function purposeFromPrd(prd) {
  const m = /(?:^|\n)## What it is for[ \t]*\n+([\s\S]*?)(?:\n[ \t]*\n|$)/.exec(String(prd || "").replace(/\r\n/g, "\n"));
  if (!m) return null;
  const text = m[1].replace(/\s*\n\s*/g, " ").trim();
  if (!text || /^\*[^*][\s\S]*\*$/.test(text)) return null;
  return text;
}

const NO_PURPOSE = "*What this app is for — one paragraph, the first of `docs/dev/PRD.md`'s \"What it is for\" (none yet).*";

/** Wrap prose at 100 columns (the docs' width). */
function wrap(text, width = 100) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/**
 * The template's description of itself → the app's, in the three files that carry one (README.md's
 * title and intro, AGENTS.md's first paragraphs, package.json's `description`); any other file, or
 * a file whose shape changed, comes back as it was. `text` is the file AFTER renaming.
 */
export function describeApp(fileRel, original, names, purpose) {
  // a checkout on Windows may have CRLF files: the work is on LF, the file keeps its own line ends
  const crlf = original.includes("\r\n");
  const out = describeLf(fileRel, original.replace(/\r\n/g, "\n"), names, purpose);
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

function describeLf(fileRel, text, names, purpose) {
  const what = purpose || NO_PURPOSE;
  if (fileRel === "README.md") {
    const start = text.indexOf("# The family app template (Quasar)");
    const end = text.indexOf("\n## The shape");
    if (start < 0 || end < start) return text;
    const intro = [
      `# ${names.product}`,
      "",
      wrap(what),
      "",
      wrap(
        "A family app, generated by the `/new-just-app` skill from the kit's template (`../just-core/template/`): the standard it follows is `../just-core/docs/app-structure.md` (§Q wins). What it is for: `docs/dev/PRD.md`.",
      ),
      "",
      wrap("Run it: `npm install` (then once `cd src-electron && npm install` and `cd e2e && npm install`), and `npm run dev`. The instructions for an AI are `AGENTS.md`."),
      "",
    ].join("\n");
    return text.slice(0, start) + intro + text.slice(end);
  }
  if (fileRel === "AGENTS.md") {
    const title = text.indexOf("\n\n");
    const end = text.indexOf("\n## Commands");
    if (title < 0 || end < title) return text;
    const intro = [
      "",
      wrap(what),
      "",
      wrap(
        "A family app: the desktop app on the kit's shell, its own Node server (Hono) with a SQLite database, the AI stack, the standard chrome (title bar, AI tasks, Help, Settings, backups, logs), help pages and tests at every level — and, until the app's own screens replace it, the template's example area, **notes**. Plain JavaScript, `\"type\": \"module\"` everywhere; Vue SFCs; Quasar's components under the kit's (`@delebash/ui`).",
      ),
      "",
      wrap("`README.md` lists the layout and every difference from Quasar's default; `docs/dev/PRD.md` is what the app is for."),
      "",
    ].join("\n");
    return text.slice(0, title + 1) + intro + text.slice(end);
  }
  if (fileRel === "package.json") {
    const pkg = JSON.parse(text);
    const sentence = purpose ? (purpose.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? purpose) : `${names.product} — a family app.`;
    pkg.description = sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
    return `${JSON.stringify(pkg, null, 2)}\n`;
  }
  return text;
}

/** Every name the app uses, derived from its slug (`house-paint`). */
export function namesFor(slug, product) {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`--name must be lowercase words joined by hyphens (got ${JSON.stringify(slug)})`);
  }
  const words = slug.split("-");
  const title = words.map((w) => w[0].toUpperCase() + w.slice(1));
  return {
    slug: `just-${slug}`,
    serverPackage: `just-${slug}-server`,
    envPrefix: `JUST_${words.join("_").toUpperCase()}`,
    product: product || `Just ${title.join(" ")}`,
    appName: `Just${title.join("")}`,
    id: `just${words.join("")}`,
    snake: `just_${words.join("_")}`,
    // the brand mark: the app's own words' initials (house-paint → "HP"; one word → its first two letters)
    mark: words.length > 1 ? words.slice(0, 2).map((w) => w[0].toUpperCase()).join("") : title[0].slice(0, 2),
  };
}

/** The guard's registries, read from its source. */
export function readRegistries(guardSource) {
  const grab = (name) => {
    const m = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n?\\});`).exec(guardSource);
    if (!m) throw new Error(`the guard has no ${name}`);
    // the registries are plain object literals of names and numbers
    return Function(`"use strict"; return (${m[1]});`)();
  };
  return { appPorts: grab("APP_PORTS"), devPorts: grab("DEV_PORTS") };
}

/** The next free ports above every registered one (§1). */
export function nextPorts({ appPorts, devPorts }) {
  const used = new Set([...RESERVED]);
  for (const p of Object.values(appPorts)) used.add(p);
  for (const d of Object.values(devPorts)) {
    used.add(d.dev);
    if (d.hmr) used.add(d.hmr);
  }
  const familyServer = Object.values(appPorts).filter((p) => p >= 17000 && p < 18000);
  let port = Math.max(...familyServer) + 1;
  while (used.has(port)) port++;
  // dev ports come in tens (1420, 1430, 1450 …): the next free decade, its +1 for HMR
  const devs = Object.values(devPorts).map((d) => d.dev).filter((p) => p >= 1400 && p < 2000);
  let dev = Math.ceil((Math.max(...devs) + 1) / 10) * 10;
  while (used.has(dev) || used.has(dev + 1)) dev += 10;
  return { port, devPort: dev, hmrPort: dev + 1 };
}

/** Rename the template's names and ports in one text file's content. */
export function renameText(text, names, ports) {
  const T = TEMPLATE_NAMES;
  let out = text
    .replaceAll(T.serverPackage, names.serverPackage)
    .replaceAll(T.envPrefix, names.envPrefix)
    .replaceAll(T.product, names.product)
    .replaceAll(T.appName, names.appName)
    .replaceAll(T.id, names.id)
    .replaceAll(T.slug, names.slug)
    .replaceAll(T.snake, names.snake);
  out = out.replace(`"mark": "${T.mark}"`, `"mark": "${names.mark}"`);
  out = out.replace(new RegExp(`\\b${T.port}\\b`, "g"), String(ports.port));
  // the dev port only where it is a port — `:9000`, `port: 9000`, `"9000"` — never a bare number
  // (a 9000 ms timeout is not a port)
  out = out.replace(new RegExp(`(:|port:\\s*|["'])${T.devPort}(?!\\d)`, "g"), (_, pre) => `${pre}${ports.devPort}`);
  return out;
}

/**
 * The HMR port (§1, §3): the template's dev server has none; an app's has one. Added to
 * `devServer` in quasar.config.js and to `installLlmUi`'s `devPorts`.
 */
export function addHmrPort(text, ports) {
  if (!ports.hmrPort) return text;
  let out = text;
  if (/devServer:\s*\{/.test(out) && !/devServer:\s*\{[^}]*hmr:/.test(out)) {
    out = out.replace(/(devServer:\s*\{[^}]*?port:\s*)(\d+)(\s*,)/, (_, a, p, c) => `${a}${p}, hmr: { port: ${ports.hmrPort} }${c}`);
  }
  out = out.replace(/devPorts:\s*\[\s*(["'])(\d+)\1\s*\]/g, (_, q, p) => `devPorts: [${q}${p}${q}, ${q}${ports.hmrPort}${q}]`);
  return out;
}

/**
 * Re-point a relative path that leaves the template for the kit (`../packages/ui/src`,
 * `file:../../packages/core`, `@../docs/family-rules.md`) so it works from the app's folder,
 * which sits beside the kit: from template/<rel> it resolves into the kit; from <app>/<rel> it
 * must reach the same file through `../just-core/`.
 */
export function repointKitPaths(text, fileRel) {
  const fileDirInTemplate = path.posix.dirname(`template/${fileRel}`);
  const kitName = path.basename(KIT);
  return text.replace(/(?<![\w./-])((?:\.\.\/)+)(packages|docs|scripts|skills)\//g, (m, ups, top) => {
    const resolved = path.posix.normalize(path.posix.join(fileDirInTemplate, ups, `${top}/`));
    // only paths that land in the kit's own top folders (not inside template/)
    if (resolved.startsWith("template/") || resolved.startsWith("../")) return m;
    // both live in the family folder: <family>/app/<file> and <family>/<kit>/<target>
    const appDir = path.posix.dirname(`app/${fileRel}`);
    const target = path.posix.join(kitName, resolved);
    let rel = path.posix.relative(appDir, target);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return rel.endsWith("/") ? rel : `${rel}/`;
  });
}

/** The destination path of a template file (file names carry the template's names too). */
export function destRel(fileRel, names) {
  return fileRel
    .replaceAll(TEMPLATE_NAMES.serverPackage, names.serverPackage)
    .replaceAll(TEMPLATE_NAMES.slug, names.slug)
    .replaceAll(TEMPLATE_NAMES.id, names.id);
}

/** Add the app to the guard's APPS, APP_PORTS and DEV_PORTS (source text in, text out). */
export function registerInGuard(src, names, ports, folderName) {
  const key = names.slug;
  if (src.includes(`name: "${key}"`)) return src;
  const envVar = `FAMILY_${names.envPrefix.replace(/^JUST_/, "")}_DIR`;
  src = src.replace(
    /(const APPS = \[\n[\s\S]*?)(\n\];)/,
    `$1\n  { name: "${key}", dir: process.env.${envVar} || join(FAMILY, "${folderName}") },$2`,
  );
  src = src.replace(/const APP_PORTS = \{([^}]*)\};/, (m, body) => `const APP_PORTS = {${body.replace(/\s*$/, "")}, "${key}": ${ports.port} };`);
  src = src.replace(
    /(const DEV_PORTS = \{\n[\s\S]*?)(\n\};)/,
    `$1\n  "${key}": { dev: ${ports.devPort}, hmr: ${ports.hmrPort} },$2`,
  );
  return src;
}

function run(cmd, args, cwd) {
  console.log(`  $ ${[cmd, ...args].join(" ")}   (in ${path.relative(FAMILY, cwd) || "."})`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
}

export function parseArgs(argv) {
  const opts = { phone: false, install: true, register: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--name") opts.name = val();
    else if (a === "--product") opts.product = val();
    else if (a === "--dest") opts.dest = val();
    else if (a === "--port") opts.port = Number(val());
    else if (a === "--dev-port") opts.devPort = Number(val());
    else if (a === "--hmr-port") opts.hmrPort = Number(val());
    else if (a === "--no-phone") opts.phone = false;
    else if (a === "--phone") {
      throw new Error("--phone: the template's phone app has no in-app server yet (it would show only the connection page) — apps are made without it until the template carries one (the kit's TASKS, the template audit)");
    }
    else if (a === "--skip-install") opts.install = false;
    else if (a === "--no-register") opts.register = false;
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.name) throw new Error("--name is required (e.g. --name house-paint)");
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const names = namesFor(opts.name, opts.product);
  const dest = path.resolve(opts.dest || path.join(FAMILY, names.slug));
  const guardSrc = readFileSync(GUARD, "utf8");
  const regs = readRegistries(guardSrc);
  const next = nextPorts(regs);
  const ports = { port: opts.port || next.port, devPort: opts.devPort || next.devPort, hmrPort: opts.hmrPort || next.hmrPort };

  console.log(`New family app ${names.slug} — "${names.product}"`);
  console.log(`  id ${names.id} · server package ${names.serverPackage} · data env ${names.envPrefix}_DATA_DIR`);
  console.log(`  ports: server ${ports.port} · dev ${ports.devPort} · HMR ${ports.hmrPort}`);
  console.log(`  into ${dest}`);
  // the app's own description, from the PRD the skill wrote first (a placeholder without one)
  const prdPath = path.join(dest, "docs", "dev", "PRD.md");
  const purpose = existsSync(prdPath) ? purposeFromPrd(readFileSync(prdPath, "utf8")) : null;
  console.log(purpose ? "  described from docs/dev/PRD.md" : "  no PRD purpose yet — README, AGENTS.md and package.json get a placeholder");

  // each template file with its git mode: an executable (the headless launcher's shell script) stays one
  const listed = execFileSync("git", ["-C", KIT, "ls-files", "-s", "-z", "template"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((line) => ({ mode: line.split(" ")[0], rel: line.slice(line.indexOf("\t") + 1).slice("template/".length) }));
  const executable = new Set(listed.filter((f) => f.mode === "100755").map((f) => f.rel));
  const files = listed
    .map((f) => f.rel)
    .filter((f) => !LOCKFILE.test(f))
    .filter((f) => opts.phone || !f.startsWith("src-capacitor/"));
  const executables = [];

  const copied = [];
  const skipped = [];
  for (const rel of files) {
    const outRel = destRel(rel, names);
    const out = path.join(dest, outRel);
    if (existsSync(out)) {
      skipped.push(outRel);
      continue;
    }
    copied.push(outRel);
    if (opts.dryRun) continue;
    mkdirSync(path.dirname(out), { recursive: true });
    const src = path.join(TEMPLATE_DIR, rel);
    if (BINARY.test(rel)) {
      copyFileSync(src, out);
    } else {
      const text = readFileSync(src, "utf8");
      const renamed = addHmrPort(repointKitPaths(renameText(text, names, ports), rel), ports);
      writeFileSync(out, describeApp(outRel, renamed, names, purpose));
    }
    if (executable.has(rel)) {
      chmodSync(out, 0o755);
      executables.push(outRel);
    }
  }
  console.log(`  copied ${copied.length} files; kept ${skipped.length} that already existed${skipped.length ? `: ${skipped.join(", ")}` : ""}`);
  if (opts.dryRun) return { names, ports, dest, copied, skipped };

  if (!opts.phone) {
    // no phone app: its build script goes with its folder
    const pkgPath = path.join(dest, "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.scripts?.["build:android"]) {
      delete pkg.scripts["build:android"];
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }

  if (!existsSync(path.join(dest, ".git"))) run("git", ["init", "-b", "main"], dest);
  // staged executable: git on Windows (core.filemode false) would record a new file's mode as 100644, and
  // the macOS and Linux builds would pack the launcher not runnable
  for (const rel of executables) {
    run("git", ["add", "--", rel], dest);
    run("git", ["update-index", "--chmod=+x", "--", rel], dest);
  }
  if (opts.install) {
    run("npm", ["install", "--no-audit", "--no-fund"], dest);
    for (const sub of ["src-electron", "src-capacitor", "e2e"]) {
      if (existsSync(path.join(dest, sub, "package.json"))) run("npm", ["install", "--no-audit", "--no-fund"], path.join(dest, sub));
    }
    run("npm", ["run", "lint"], dest);
    run("npm", ["run", "test:server"], dest);
    run("npm", ["run", "test:unit"], dest);
  }
  if (opts.register) {
    writeFileSync(GUARD, registerInGuard(readFileSync(GUARD, "utf8"), names, ports, path.basename(dest)));
    console.log(`  registered ${names.slug} in the guard (APPS, APP_PORTS, DEV_PORTS)`);
    run("node", [GUARD], KIT);
  }
  return { names, ports, dest, copied, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`new-app: ${e.message}`);
    process.exit(1);
  });
}
