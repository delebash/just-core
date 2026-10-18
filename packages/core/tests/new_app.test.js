// SPDX-License-Identifier: MIT
// The /new-just-app generator's pure steps (scripts/new-app.js): the names a slug gives (§1),
// the next free ports from the guard's own registries, the template's names and ports renamed,
// the kit paths re-pointed from inside the kit to beside it, and the guard registration.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  addHmrPort,
  destRel,
  namesFor,
  nextPorts,
  readRegistries,
  registerInGuard,
  renameText,
  repointKitPaths,
} from "../../../scripts/new-app.js";

const GUARD_SRC = readFileSync(new URL("../../../scripts/check-family.js", import.meta.url), "utf8");
const names = namesFor("house-paint");
const ports = { port: 17497, devPort: 1460, hmrPort: 1461 };

test("a slug gives every name (§1)", () => {
  expect(names).toEqual({
    slug: "just-house-paint",
    serverPackage: "just-house-paint-server",
    envPrefix: "JUST_HOUSE_PAINT",
    product: "Just House Paint",
    appName: "JustHousePaint",
    id: "justhousepaint",
    snake: "just_house_paint",
    mark: "HP",
  });
  expect(namesFor("voice").mark).toBe("Vo");
  expect(namesFor("house-paint", "House Paint").product).toBe("House Paint");
  expect(() => namesFor("House_Paint")).toThrow(/lowercase words/);
});

test("the next free ports skip the reserved ones", () => {
  expect(nextPorts(readRegistries(GUARD_SRC))).toEqual({ port: 17497, devPort: 1460, hmrPort: 1461 });
  // with the app registered, the following app gets the next ones
  const after = readRegistries(registerInGuard(GUARD_SRC, names, ports, "just-house-paint"));
  expect(nextPorts(after)).toEqual({ port: 17498, devPort: 1470, hmrPort: 1471 });
});

test("the template's names and ports are renamed, a bare number is not", () => {
  const src = [
    'id: "familytemplate", appName: "FamilyTemplate", productName: "Family Template",',
    'serverEntry: path.join(here, "node_modules", "family-template-server", "src", "serve.js"),',
    'dataDirEnv: "FAMILY_TEMPLATE_DATA_DIR", port: 17490, log: "family-template.log", logger: "family_template.app",',
    'devServer: { host: "127.0.0.1", port: 9000, strictPort: true }, origins: ["http://localhost:9000"],',
    "toast({ duration: 9000 }); devPorts: ['9000']",
    '"mark": "FT",',
  ].join("\n");
  expect(renameText(src, names, ports)).toBe(
    [
      'id: "justhousepaint", appName: "JustHousePaint", productName: "Just House Paint",',
      'serverEntry: path.join(here, "node_modules", "just-house-paint-server", "src", "serve.js"),',
      'dataDirEnv: "JUST_HOUSE_PAINT_DATA_DIR", port: 17497, log: "just-house-paint.log", logger: "just_house_paint.app",',
      'devServer: { host: "127.0.0.1", port: 1460, strictPort: true }, origins: ["http://localhost:1460"],',
      "toast({ duration: 9000 }); devPorts: ['1460']",
      '"mark": "HP",',
    ].join("\n"),
  );
});

test("the HMR port joins the dev server and installLlmUi's devPorts", () => {
  expect(addHmrPort("devServer: { host: '127.0.0.1', port: 1460, strictPort: true },", ports)).toBe(
    "devServer: { host: '127.0.0.1', port: 1460, hmr: { port: 1461 }, strictPort: true },",
  );
  expect(addHmrPort('installLlmUi(app, { devPorts: ["1460"], i18n })', ports)).toBe('installLlmUi(app, { devPorts: ["1460", "1461"], i18n })');
  // already there: untouched
  const has = "devServer: { port: 1460, hmr: { port: 1461 }, open: false },";
  expect(addHmrPort(has, ports)).toBe(has);
});

test("kit paths are re-pointed from inside the kit to beside it", () => {
  expect(repointKitPaths("'@delebash/ui': path.resolve(import.meta.dirname, '../packages/ui/src'),", "quasar.config.js")).toBe(
    "'@delebash/ui': path.resolve(import.meta.dirname, '../just-core/packages/ui/src'),",
  );
  expect(repointKitPaths('"@delebash/core": "file:../../packages/core"', "server/package.json")).toBe(
    '"@delebash/core": "file:../../just-core/packages/core"',
  );
  expect(repointKitPaths("The family rules: @../docs/family-rules.md", "CLAUDE.md")).toBe("The family rules: @../just-core/docs/family-rules.md");
  // the app's own docs stay the app's
  expect(repointKitPaths('import.meta.glob("../../docs/*.md")', "src/services/helpDocs.js")).toBe('import.meta.glob("../../docs/*.md")');
});

test("file names carry the new names", () => {
  expect(destRel("build/launcher/family-template-server.cmd", names)).toBe("build/launcher/just-house-paint-server.cmd");
  expect(destRel("src/boot/familytemplate.js", names)).toBe("src/boot/justhousepaint.js");
});

test("registering adds the app to APPS, APP_PORTS and DEV_PORTS once", () => {
  const out = registerInGuard(GUARD_SRC, names, ports, "just-house-paint");
  expect(out).toContain('{ name: "just-house-paint", dir: process.env.FAMILY_HOUSE_PAINT_DIR || join(FAMILY, "just-house-paint") },');
  const regs = readRegistries(out);
  expect(regs.appPorts["just-house-paint"]).toBe(17497);
  expect(regs.devPorts["just-house-paint"]).toEqual({ dev: 1460, hmr: 1461 });
  expect(registerInGuard(out, names, ports, "just-house-paint")).toBe(out);
});
