// SPDX-License-Identifier: MIT
// THE family data-location policy — one implementation, every app (the port of
// llm_runner/platform/data_paths.py).
//
// The user's ruling (2026-08-14, after JustVoice drifted): *"none of the apps should have
// anything stored in [an OS app-data folder]... absolutely no data for any of these apps
// should be stored anywhere but where the user has set the storage directory, which by
// default will be the install directory for the app"* and *"don't hardcode anything —
// app-data is not banned, what is banned is anything that the user has not decided"*.
//
// So the policy, in strict order:
//   1. The user's explicit choice — the app's data-dir env var (which the desktop shell
//      also uses to hand down a `Change folder` selection, and headless `--data-dir`
//      sets). Always wins, no questions.
//   2. Beside the app — a `data/` folder in the install directory: next to the packaged
//      executable, next to the source checkout root in development. This is the DEFAULT:
//      portable, visible, deletable, and nothing lands in a hidden per-user folder the
//      user never chose.
//   3. The OS app-data dir — ONLY when the install directory is not writable (Program
//      Files, a read-only bundle). Not a preference: the last resort that keeps a
//      locked-down install from failing outright.
//
// Each app's paths module is a thin call into `resolveDataDir` — the shape may never be
// re-implemented per app (that divergence is what produced JustVoice writing to Roaming
// while JustWrite ran portable, and cost an audit to find). The desktop shell resolves
// the same ladder before the server exists; keep the two in lock-step.
//
// Paths are strings here (Python handed out `Path`s): each one comes out in the form
// `str(Path(…))` gives — native separators, no "." parts, no trailing separator.

import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as self from "./data_paths.js";
import { IS_MAC, IS_WIN } from "./py.js";

// PyInstaller's `sys.frozen` / `sys.executable`. A packaged Electron app runs its server on
// the app's own executable (main, a utilityProcess, or ELECTRON_RUN_AS_NODE headless);
// development and the tests run it on `electron`/`node` from node_modules or the PATH —
// that difference is the "frozen" test. Tests assign these two (Python monkeypatched sys).
export const runtime = {
  frozen: Boolean(process.versions.electron) && !/^(electron|node)(\.exe)?$/i.test(path.basename(process.execPath)),
  executable: process.execPath,
};

/** `str(PurePath(p))` for this platform: native separators, repeated separators and "."
 * parts dropped, no trailing separator; ".." is KEPT (pathlib never resolves it).
 * Candidate for platform/. */
export function purePath(p) {
  let s = String(p);
  if (s === "") return ".";
  if (IS_WIN) {
    s = s.replace(/\//g, "\\");
    let prefix = "";
    const unc = /^\\\\[^\\]+\\[^\\]+/.exec(s);
    if (unc) {
      prefix = `${unc[0]}\\`; // a UNC drive always carries its root
      s = s.slice(unc[0].length).replace(/^\\+/, "");
    } else {
      const drive = /^[A-Za-z]:/.exec(s);
      if (drive) {
        prefix = drive[0];
        s = s.slice(2);
      }
      if (s.startsWith("\\")) {
        prefix += "\\";
        s = s.replace(/^\\+/, "");
      }
    }
    const parts = s.split("\\").filter((x) => x !== "" && x !== ".");
    return prefix + parts.join("\\") || ".";
  }
  // POSIX: exactly two leading slashes are kept (pathlib does), more collapse to one.
  const prefix = s.startsWith("//") && !s.startsWith("///") ? "//" : s.startsWith("/") ? "/" : "";
  const parts = s.split("/").filter((x) => x !== "" && x !== ".");
  return prefix + parts.join("/") || ".";
}

/** `Path.is_absolute()` — on Windows a drive AND a root (or a UNC share). */
function isAbsolutePy(p) {
  const s = String(p);
  if (!IS_WIN) return s.startsWith("/");
  return /^[A-Za-z]:[\\/]/.test(s) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(s);
}

/** `Path(base) / p` — pathlib's join (a rooted right side keeps the left's drive on
 * Windows; a different drive replaces it). */
function joinPy(base, p) {
  const b = String(base);
  const s = String(p);
  if (isAbsolutePy(s)) return purePath(s);
  if (IS_WIN) {
    const drive = /^[A-Za-z]:/.exec(s);
    const baseDrive = /^[A-Za-z]:/.exec(b);
    if (drive && (!baseDrive || drive[0].toLowerCase() !== baseDrive[0].toLowerCase())) return purePath(s);
    if (drive) return purePath(`${b}\\${s.slice(2)}`);
    if (/^[\\/]/.test(s)) return purePath((baseDrive ? baseDrive[0] : "") + s);
    return purePath(`${b}\\${s}`);
  }
  return purePath(`${b}/${s}`);
}

/** `Path(p).resolve()` (strict=False): absolute, symlinks resolved as far as the path
 * exists, the missing tail kept as given. */
function resolveLoose(p) {
  let head = path.resolve(String(p));
  const tail = [];
  for (;;) {
    try {
      const real = realpathSync.native(head);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const up = path.dirname(head);
      if (up === head) return path.resolve(String(p));
      tail.push(path.basename(head));
      head = up;
    }
  }
}

/** The parts of an absolute, normalized path: [anchor, ...names]. */
function partsOf(abs) {
  const { root } = path.parse(abs);
  return [root, ...abs.slice(root.length).split(path.sep).filter(Boolean)];
}

// pathlib compares Windows paths case-insensitively (its normcase is lower()).
const norm = (s) => (IS_WIN ? s.toLowerCase() : s);

/**
 * Can we actually create files here? Probe, never guess — a path can exist and still be
 * read-only (Program Files, a mounted bundle). (Python's `_is_writable`; a test patches it.)
 */
export function _isWritable(directory) {
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    return false;
  }
  const probe = path.join(directory, ".llm_runner_write_probe");
  try {
    writeFileSync(probe, "x");
  } catch {
    return false;
  }
  try {
    unlinkSync(probe);
  } catch {
    /* left behind — still writable */
  }
  return true;
}

/**
 * The string to STORE for a media file (user ruling 2026-08-14).
 *
 * A file inside the data root is stored RELATIVE to it, POSIX-style, so the row survives
 * the user moving their data folder — the whole point of the Change-folder verb, which
 * used to copy the files and leave every absolute row pointing at the deleted original.
 * It also makes a backup restore onto another machine (or another drive) resolve.
 *
 * A path OUTSIDE the data root keeps its absolute form: it is not ours to relocate, and
 * rewriting it would break the reference.
 */
export function toDataRelative(p, dataDir) {
  try {
    const abs = partsOf(resolveLoose(p));
    const base = partsOf(resolveLoose(dataDir));
    if (base.length > abs.length) return purePath(p);
    for (let i = 0; i < base.length; i++) if (norm(abs[i]) !== norm(base[i])) return purePath(p);
    const rest = abs.slice(base.length);
    return rest.length ? rest.join("/") : ".";
  } catch {
    return purePath(p);
  }
}

/**
 * Resolve a stored media path back to a real one.
 *
 * Absolute values pass through unchanged — that covers both deliberately external files
 * and rows written before the relative-path rule, so no migration is needed and nothing
 * breaks in place.
 */
export function fromDataRelative(stored, dataDir) {
  return isAbsolutePy(stored) ? purePath(stored) : joinPy(dataDir, stored);
}

/**
 * The app's install directory: the packaged executable's folder (`runtime.frozen`), else
 * the caller's source checkout root. null when neither is knowable.
 */
export function installDir(sourceRoot = null) {
  if (runtime.frozen) return path.dirname(resolveLoose(runtime.executable));
  return sourceRoot != null ? resolveLoose(sourceRoot) : null;
}

/**
 * platformdirs' `user_data_dir(app)` (4.10.1, appauthor unset, roaming off), read from its
 * source: Windows `%LOCALAPPDATA%\<app>\<app>` (WIN_PD_OVERRIDE_LOCAL_APPDATA first);
 * macOS `$XDG_DATA_HOME/<app>` else `~/Library/Application Support/<app>`; elsewhere
 * `$XDG_DATA_HOME/<app>` else `~/.local/share/<app>`. Nothing is created.
 * (Python resolves Windows' Local AppData through the shell API; the LOCALAPPDATA variable
 * names the same folder.)
 */
export function userDataDir(appName) {
  if (IS_WIN) {
    const override = (process.env.WIN_PD_OVERRIDE_LOCAL_APPDATA || "").trim();
    const base = override || process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");
    return path.join(path.normalize(base), appName, appName);
  }
  const xdg = (process.env.XDG_DATA_HOME || "").trim();
  if (xdg) return purePath(`${xdg}/${appName}`);
  const base = IS_MAC ? "Library/Application Support" : ".local/share";
  return purePath(`${homedir()}/${base}/${appName}`);
}

/**
 * The family data root for `appName` per the module policy.
 *
 * `envVar` — the app's data-dir variable (`JUSTVOICE_DATA_DIR`, `JUSTWRITE_DATA_DIR`):
 * the user's/shell's explicit choice. `sourceRoot` — the app's checkout root, used in
 * development when not packaged (an app passes its own; the kit cannot guess it).
 * `env` — override the environment (tests).
 */
export function resolveDataDir({ appName, envVar, sourceRoot = null, env = null } = {}) {
  const environ = env == null ? process.env : env;
  const chosen = String(environ[envVar] || "").trim();
  if (chosen) return found(purePath(chosen), "variable");

  // The Change-folder pointer — read by the desktop shell AND the headless server since the
  // Electron move (only the Rust shells read it before: the kit FINDING "the data-dir
  // ladder's four copies disagree"). A pointer naming exactly the computed default is
  // residue of the removed first-run lock, not a choice, and is deleted (family ruling
  // 2026-08-14).
  const def = self.defaultDataDir({ appName, sourceRoot });
  const pointer = self.pointerFile({ appName, sourceRoot });
  try {
    const p = readFileSync(pointer, "utf8").trim();
    if (p) {
      if (samePath(p, def)) rmSync(pointer, { force: true });
      else return found(purePath(p), "pointer");
    }
  } catch {
    /* no pointer */
  }
  return found(def, "default");
}

// Where this process's ladder took each folder from (2026-10-20): "variable" (the app's data-dir variable — a
// choice made at every start), "pointer" (Change folder's pointer — a choice made once, earlier) or "default"
// (the folder the ladder works out, which the user didn't name). The start checks ask (dataDirStartProblem):
// a folder the user named must be there, the default may be made, and only a folder being chosen is held to
// the path rule — a pointer that worked before this rule is used as it is.
const dirSources = new Map();
const dirKey = (dir) => norm(path.resolve(String(dir)));
function found(dir, source) {
  dirSources.set(dirKey(dir), source);
  return dir;
}

/** Where this process's ladder took `dir` from: "variable", "pointer", "default" — or null (not the ladder's). */
export function dataDirSource(dir) {
  return dirSources.get(dirKey(dir)) ?? null;
}

/** Did this process's ladder take `dir` from the user's naming (the variable, a pointer)? */
export function isNamedDataDir(dir) {
  const source = dataDirSource(dir);
  return source === "variable" || source === "pointer";
}

/** The longest data-folder path taken from the user (2026-10-20): the AI and native libraries the apps run
 *  aren't long-path aware — one failed past ~190 characters, another ~220, the server ~245 (measured). */
export const MAX_DATA_DIR_CHARS = 180;

/**
 * Why a data folder being chosen can't hold the data, in plain words — or null (2026-10-20, an unusual
 * computer's review): a path past MAX_DATA_DIR_CHARS, or a last part ending in "." or " " — Windows drops them
 * (Node made "data.", SQLite then opened "data"). Change folder and the `<APP>_DATA_DIR` / `--data-dir` given at
 * a start ask this one function; a Change-folder pointer made before the rule is only logged (dataDirStartProblem).
 */
export function dataDirPathProblem(dir) {
  const abs = path.resolve(String(dir));
  if (abs.length > MAX_DATA_DIR_CHARS) return `its path is longer than ${MAX_DATA_DIR_CHARS} characters`;
  if (/[. ]$/.test(path.basename(abs))) return "its name ends in a dot or a space, which Windows drops";
  return null;
}

/** A failed mkdir, write or copy, in plain words (the shell's Change folder says its failures with it too). */
export function fsProblem(e) {
  switch (e?.code) {
    case "EFBIG":
      // a FAT32 drive holds no file of 4 GB or more (the AI photo's models are over 4 GB) — the copy said
      // "copy failed: EFBIG" until 2026-10-20
      return "a file is bigger than its drive can hold (a FAT32 drive takes no file over 4 GB — use a drive formatted NTFS, exFAT or APFS)";
    case "EIO":
      return "its drive failed to read or write (unplugged, or failing)";
    case "ENOENT":
    case "ENODEV":
    case "ENXIO":
      return "its drive isn't there (unplugged, or a network folder offline)";
    case "EACCES":
    case "EPERM":
      return "the app isn't allowed to write there";
    case "EROFS":
      return "its drive is read-only";
    case "ENOSPC":
      return "its drive is full";
    case "ENOTDIR":
    case "EEXIST":
      return "a file has that name";
    default:
      return String(e?.message || e).split("\n")[0];
  }
}

/** A folder the user named that isn't there, in plain words — or null when it is. Nothing is made. */
export function missingDirProblem(dir) {
  try {
    statSync(dir);
    return null;
  } catch (e) {
    if (e?.code !== "ENOENT") return fsProblem(e);
  }
  // its drive there, the folder not: moved, renamed or deleted — never made empty in its place
  return existsSync(path.parse(path.resolve(String(dir))).root) ? "it isn't there" : fsProblem({ code: "ENOENT" });
}

/**
 * Why `dir` can't be the data folder now, in plain words — or null (2026-10-20). A small file is written and
 * removed: a missing drive, an unplugged USB stick, an offline share, a read-only drive or Controlled Folder
 * Access is said here, before a start fails deep inside with a stack. `named`: the user named it — one that isn't
 * there is said so ("it isn't there"), never made (an empty folder made in its place started the app on no
 * data); otherwise it is made when missing. `chosen` (default `named`): it is being chosen now —
 * dataDirPathProblem applies too.
 */
export function dataDirProblem(dir, { named = true, chosen = named } = {}) {
  if (chosen) {
    const why = dataDirPathProblem(dir);
    if (why) return why;
  }
  if (named) {
    const why = missingDirProblem(dir);
    if (why) return why;
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return fsProblem(e);
  }
  // this process's own probe: the shell and its server may check the same folder at once
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    writeFileSync(probe, "x");
  } catch (e) {
    return fsProblem(e);
  }
  try {
    unlinkSync(probe);
  } catch {
    /* left behind — still writable */
  }
  return null;
}

/** The one line a data folder that can't be used is said in (the shell's dialog, the headless server). */
export function cantUseDataDir(dir, why) {
  return `The data folder ${dir} can't be used: ${why}`;
}

/**
 * The start's check of a data folder, by where it came from (`source`, dataDirSource) — dataDirProblem's answer
 * (2026-10-20). One the user named — the variable (or `--data-dir`) and Change folder's pointer — must be there;
 * the default, or a folder the start's caller already checked (null), may be made. The variable is chosen at
 * every start, so it is held to the path rule; a pointer was chosen once, before that rule, and is used as it is
 * — its problem only logged (`log.warn`), so the apps' pointers that work keep working.
 */
export function dataDirStartProblem(dir, { source = null, log = null } = {}) {
  if (source === "pointer") {
    const why = dataDirPathProblem(dir);
    if (why) log?.warn?.(`the data folder ${dir} is used as Change folder left it, though ${why}`);
  }
  return dataDirProblem(dir, { named: source === "variable" || source === "pointer", chosen: source === "variable" });
}

/**
 * An install folder that is no place for data, writable or not (2026-10-20, a review of the help): a Mac
 * app's bundle — an update replaces it whole, a signed one must not change, and Apple keeps an app's data
 * in ~/Library/Application Support; a user-owned app in Applications IS writable, and its houses would
 * have gone with the next update — and an AppImage's folder, mounted (read-only) or extracted
 * (`--appimage-extract`, its headless launcher's way in): AppImages keep data in the XDG data folder, so
 * the extracted launcher's server and the AppImage's window share one.
 */
export function bundledInstall(base, { platform = process.platform, exists = existsSync, frozen = runtime.frozen } = {}) {
  // only a packaged app: a source checkout is never a bundle (one run from a terminal an AppImage started
  // inherits its APPIMAGE variable — not a sign of anything here)
  if (base == null || !frozen) return false;
  if (platform === "darwin") return /\.app\/Contents\/MacOS\/?$/.test(String(base).replace(/\\/g, "/"));
  // an AppImage's folder, mounted or extracted, has its AppRun beside the executable
  if (platform === "linux") return exists(path.join(base, "AppRun"));
  return false;
}

/**
 * The default data root: `data/` in the install directory when it is writable (and not a bundle —
 * bundledInstall), else the OS fallback (decided 2026-10-08: `%LOCALAPPDATA%\<App>\<App>` —
 * platformdirs' folder, local, not roaming).
 */
export function defaultDataDir({ appName, sourceRoot = null } = {}) {
  const base = installDir(sourceRoot);
  if (base != null && !self.bundledInstall(base)) {
    const candidate = path.join(base, "data");
    if (self._isWritable(candidate)) return candidate;
  }
  const fallback = userDataDir(appName);
  if (base != null && self.bundledInstall(base)) self._adoptBundledData(path.join(base, "data"), fallback);
  // Last resort only — a non-writable install (see the header).
  return fallback;
}

/** A data folder an earlier version left inside a bundle (a Mac app's, before 2026-10-20) moves to the
 *  fallback once, when that has none yet — never left where the next update deletes it. */
export function _adoptBundledData(old, fallback) {
  try {
    if (!existsSync(old) || existsSync(fallback)) return;
    mkdirSync(path.dirname(fallback), { recursive: true });
    try {
      renameSync(old, fallback);
    } catch {
      cpSync(old, fallback, { recursive: true });
      rmSync(old, { recursive: true, force: true });
    }
  } catch {
    // left where it was: the fallback starts empty, the old folder stays to be moved by hand
  }
}

/**
 * Where the Change-folder pointer `dataroot.txt` lives: the install directory when it is
 * writable; else BESIDE the OS fallback root, never inside it, so moving the data can't
 * delete it (decided 2026-10-08: `%LOCALAPPDATA%\<App>\dataroot.txt`). On macOS and Linux
 * the fallback root has no app folder of its own above it, so the pointer beside it is
 * `<App>.dataroot.txt`.
 */
export function pointerFile({ appName, sourceRoot = null } = {}) {
  const base = installDir(sourceRoot);
  if (base != null && !self.bundledInstall(base) && self._isWritable(base)) return path.join(base, "dataroot.txt");
  const fallback = userDataDir(appName);
  return IS_WIN ? path.join(path.dirname(fallback), "dataroot.txt") : path.join(path.dirname(fallback), `${appName}.dataroot.txt`);
}

/** Is `root` the install directory's own `data/` (the Storage panel's "portable")? */
export function isPortable(root, { sourceRoot = null } = {}) {
  const base = installDir(sourceRoot);
  if (base == null || self.bundledInstall(base)) return false;
  const rel = path.relative(path.resolve(base), path.resolve(root));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** `Path(a) == Path(b)` — the same normalized path (case-insensitive on Windows).
 * Candidate for platform/. */
export function samePath(a, b) {
  return norm(purePath(a)) === norm(purePath(b));
}
