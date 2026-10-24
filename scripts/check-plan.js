// SPDX-License-Identifier: MIT
// The plan check — a plan's "standard" claims name real kit code (the family rules, 2026-10-24: the AI photo was
// planned as "the family's engine pattern", a resemblance with no kit file, and built inside the app).
//
//   node scripts/check-plan.js <plan.md>…        (exit 0 = every row passes, 1 = a row fails)
//
// Every table in the plan with a "Kit code" column is a standards table. Each row's Kit code cell must be one of:
//   · kit code that exists — backticked kit files (`packages/core/src/runner/binary.js`) or kit exports
//     (`acquireRuntime`), each one checked;
//   · "app — <why>" — the app's own logic (house-painting, writing, voice), never an engine, control, look,
//     route shape or service the kit has (the guard checks those in the code);
//   · "NOT STANDARD — <the standard option and the trade-off>" — printed as waiting for the user's word on that row.
// Anything else ("follows the family's pattern", an empty cell, a backticked name the kit doesn't have) fails.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

/** Every name the kit exports from packages/core and packages/ui (functions, constants, classes, re-exports). */
export function kitExports() {
  const names = new Set();
  for (const f of [...walk(join(KIT, "packages", "core", "src")), ...walk(join(KIT, "packages", "ui", "src"))]) {
    if (!/\.(js|vue)$/.test(f)) continue;
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && name !== "default") names.add(name);
      }
    }
    if (f.endsWith(".vue")) names.add(f.split(/[\\/]/).pop().replace(/\.vue$/, ""));
  }
  return names;
}

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** `{row, kitCode, verdict: "ok"|"app"|"not-standard"|"fail", why}` for every standards-table row in `text`. */
export function checkPlanText(text, exports = kitExports()) {
  const out = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const head = cells(lines[i]);
    const col = head.findIndex((h) => /^kit code$/i.test(h.replace(/\*/g, "")));
    if (col < 0 || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) continue;
    for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
      const row = cells(lines[i]);
      const piece = row[0] ?? "";
      const kitCode = row[col] ?? "";
      if (/^NOT STANDARD\b/i.test(kitCode)) {
        out.push({ piece, kitCode, verdict: "not-standard", why: "waits for the user's word on this row" });
        continue;
      }
      if (/^app\s+[—-]\s+\S/i.test(kitCode)) {
        out.push({ piece, kitCode, verdict: "app", why: "the app's own logic" });
        continue;
      }
      const named = [...kitCode.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
      if (!named.length) {
        out.push({ piece, kitCode, verdict: "fail", why: "names no kit code — name the kit file or export, or say \"app — why\" or \"NOT STANDARD — the option and the trade-off\"" });
        continue;
      }
      const missing = named.filter((n) => {
        const name = n.replace(/\(\)$/, "").replace(/:\d+(-\d+)?$/, "");
        if (/[/\\]/.test(name) || /\.(js|vue|md)$/.test(name)) return !existsSync(join(KIT, name));
        return !exports.has(name);
      });
      out.push(missing.length
        ? { piece, kitCode, verdict: "fail", why: `not in the kit: ${missing.join(", ")}` }
        : { piece, kitCode, verdict: "ok", why: "" });
    }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.log("usage: node scripts/check-plan.js <plan.md>…");
    process.exit(1);
  }
  const exports = kitExports();
  let failed = false;
  for (const file of files) {
    const rows = checkPlanText(readFileSync(file, "utf8"), exports);
    console.log(`\n${relative(process.cwd(), file)} — ${rows.length ? `${rows.length} standards rows` : "no standards table (a \"Kit code\" column)"}`);
    if (!rows.length) failed = true;
    for (const r of rows) {
      const mark = { ok: "✓", app: "·", "not-standard": "?", fail: "✗" }[r.verdict];
      console.log(`  ${mark} ${r.piece}${r.why ? ` — ${r.why}` : ""}`);
      if (r.verdict === "fail") failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
