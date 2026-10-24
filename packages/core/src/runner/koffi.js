// SPDX-License-Identifier: MIT
// koffi (koffi.dev) — the native calls into Windows' own DLLs (kernel32's job objects, dxgi's adapters) — loaded
// only on Windows, by its ES-module import (koffi.dev/start: `import koffi from 'koffi'`) as a top-level await:
// the callers stay synchronous and no other platform loads the native module. null elsewhere.
export const koffi = process.platform === "win32" ? (await import("koffi")).default : null;
