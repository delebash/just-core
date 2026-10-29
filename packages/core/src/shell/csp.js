// SPDX-License-Identifier: MIT
// The desktop window's Content-Security-Policy for app:// pages (main.js serves the built UI with it). The default
// below; an app's `cspAdd` adds sources to a directive — one the default lists, or (2026-10-29, docgen's frame of its
// own server's page) one it doesn't, which then holds exactly the app's sources; a whole `csp` replaces it all.
// Pure, so its test runs without Electron.

export const CSP_DEFAULT = [
  ["default-src", "'self'"],
  ["script-src", "'self'"],
  ["style-src", "'self' 'unsafe-inline'"],
  ["img-src", "'self' data: blob: http://127.0.0.1:* http://localhost:*"],
  ["media-src", "'self' data: blob: http://127.0.0.1:* http://localhost:*"],
  ["font-src", "'self' data:"],
  ["connect-src", "'self' http://127.0.0.1:* http://localhost:*"],
  ["worker-src", "'self' blob:"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
];

// a directive's name, and one source: nothing that would end it and start another (";" or ",")
const NAME = /^[a-z][a-z-]*$/;
const SOURCE = /^[^\s;,]+$/;

/** The policy for `config` ({ csp, cspAdd }). Throws on a cspAdd that isn't { "<directive>": ["<source>", …] }. */
export function buildCsp({ csp = null, cspAdd = null } = {}) {
  if (csp) return csp;
  const add = cspAdd || {};
  for (const [name, sources] of Object.entries(add)) {
    if (!NAME.test(name)) throw new Error(`cspAdd: "${name}" isn't a directive's name`);
    if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string" && SOURCE.test(s))) {
      throw new Error(`cspAdd["${name}"]: a list of sources, each without a space, ";" or ","`);
    }
  }
  const known = new Set(CSP_DEFAULT.map(([name]) => name));
  const extended = CSP_DEFAULT.map(([name, src]) => [name, src, ...(add[name] || [])].join(" "));
  const added = Object.entries(add)
    .filter(([name, sources]) => !known.has(name) && sources.length)
    .map(([name, sources]) => [name, ...sources].join(" "));
  return [...extended, ...added].join("; ");
}
