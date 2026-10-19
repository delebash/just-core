// SPDX-License-Identifier: MIT
// Which spellchecker languages to switch on (2026-10-18; the shell's `setSpellCheckerLanguages`
// command — electronjs.org/docs/latest/tutorial/spellchecker: "The built in spellchecker does not
// automatically detect what language a user is typing in"). The app asks for languages in order —
// JustWrite: the book's, then the interface's — and each becomes the spellchecker's language for
// it: the same code; else the variety of it the spellchecker already uses (its start-up language
// follows the system's — an English book on a US machine stays en-US); else the plain language;
// else its first regional variety ("es" → "es-ES"); one it doesn't have is skipped. Pure, so it is
// tested without Electron.

/**
 * @param {string[]} wanted     BCP-47 codes, most wanted first ("es-419", "en")
 * @param {string[]} available  session.availableSpellCheckerLanguages
 * @param {string[]} [current]  session.getSpellCheckerLanguages() — the varieties in use now
 * @returns {string[]} the available codes to set, in order, none twice
 */
export function pickSpellLanguages(wanted, available, current = []) {
  const have = (available || []).map(String);
  const lower = have.map((c) => c.toLowerCase());
  const inUse = (current || []).map((c) => String(c).toLowerCase());
  const out = [];
  for (const code of wanted || []) {
    const c = String(code || "").toLowerCase();
    if (!c) continue;
    const base = c.split("-")[0];
    let i = lower.indexOf(c);
    if (i < 0) i = lower.indexOf(inUse.find((u) => u.split("-")[0] === base && lower.includes(u)) ?? "");
    if (i < 0) i = lower.indexOf(base);
    if (i < 0) i = lower.findIndex((a) => a.startsWith(`${base}-`));
    if (i >= 0 && !out.includes(have[i])) out.push(have[i]);
  }
  return out;
}
