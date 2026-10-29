// SPDX-License-Identifier: MIT
// An AppImage's file is named from electron-builder's productFilename — the productName, unless the linux block names an
// executableName — and electron-builder 26 refuses anything there but letters, digits, hyphens, underscores, dots and
// spaces (app-builder-lib appImageUtil.js validateCriticalPathString: "cannot be safely used in file paths"). docgen's
// "Just AI i18n & DocGen" stopped its Linux release build on that (its dry run 40826540251, 2026-10-29).

/** The block `key: { … }` in a config's source, braces matched (strings with braces in them aren't expected there). */
function block(source, key) {
  const at = source.search(new RegExp(`\\b${key}:\\s*\\{`));
  if (at < 0) return "";
  let depth = 0;
  for (let i = source.indexOf("{", at); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(at, i + 1);
  }
  return source.slice(at);
}

/** What stops an app's AppImage over its name, from its quasar.config.js source — null when nothing does. */
export function appImageNameProblem(quasarConfig) {
  const product = quasarConfig.match(/productName:\s*['"]([^'"]+)['"]/)?.[1];
  if (!product || !/[^A-Za-z0-9 ._-]/.test(product)) return null;
  if (/\bexecutableName:\s*['"][A-Za-z0-9._-]+['"]/.test(block(quasarConfig, "linux"))) return null;
  return `productName "${product}" has a character an AppImage's file name can't hold — give electron-builder's linux block an executableName (the Windows exe's name), as docgen's does`;
}
