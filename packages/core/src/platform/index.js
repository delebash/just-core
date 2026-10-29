// SPDX-License-Identifier: MIT
// `@delebash/core/platform` — what Python's `llm_runner.platform` package exports: the
// stack-level server pieces every family app wires the same way.

export { bearerAuth } from "./auth.js";
export { starletteCors } from "./cors.js";
export { CAPACITOR_ORIGINS, csrfOrigin, resourceIsolation } from "./csrf.js";
export { finishInterruptedRestore, makeDataRouter, restoreUnfinished, sweepWorkFolders } from "./data_api.js";
export { fromDataRelative, installDir, resolveDataDir, toDataRelative } from "./data_paths.js";
export { dirSize, makeDiskRouter } from "./disk_api.js";
export { ApiError, HttpError, installErrorHandlers, requestIdOf, unhandledEnvelope } from "./errors.js";
export { makeHealthRouter } from "./health_api.js";
export { JobRegistry } from "./jobs.js";
export { makeJobsRouter } from "./jobs_api.js";
export { installFileLog, installLogRing, makeLogsRouter } from "./logs_api.js";
export { MaintenanceGate } from "./maintenance.js";
export { migrate, schemaVersion } from "./migrate.js";
export { makePrefsRouter } from "./prefs_api.js";
export * as procs from "./procs.js";
export { attachment, closeApp, createServer, Hono, input, installPyFloatBodies, onClose, readJson, schemaProblem, stream, uploadLimit } from "./server.js";
export { runServer, serveStatic } from "./serve.js";
export { serveUi } from "./serve_ui.js";
export { canonicalJson, defaultsFingerprints, fingerprint, retireSettings, upgradeSettings } from "./settings_upgrade.js";
export { makeShutdownRouter, SHUTDOWN_PATH } from "./shutdown_api.js";
export { openDatabase } from "./sql.js";
export { checkIfMatch, etagOf } from "./versions.js";
export { ChangeCounter, clientIdOf, makeSyncRevRouter } from "./window_changes.js";
