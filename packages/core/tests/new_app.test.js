// SPDX-License-Identifier: MIT
// The /new-just-app generator's pure steps (scripts/new-app.js): the names a slug gives (§1),
// the next free ports from the guard's own registries, the template's names and ports renamed,
// the kit paths re-pointed from inside the kit to beside it, and the guard registration.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  addHmrPort,
  describeApp,
  destRel,
  namesFor,
  nextPorts,
  parseArgs,
  purposeFromPrd,
  readRegistries,
  registerInGuard,
  renameText,
  repointKitPaths,
} from "../../../scripts/new-app.js";

const GUARD_SRC = readFileSync(new URL("../../../scripts/check-family.js", import.meta.url), "utf8");
const names = namesFor("house-paint");
const ports = { port: 17499, devPort: 1460, hmrPort: 1461 };

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
  // the registries as they were before the first app was generated (fixed here — the live guard
  // grows with every app)
  const before = {
    appPorts: { JustWrite: 17495, JustVoice: 17494, docgen: 8742, template: 17490 },
    devPorts: { JustWrite: { dev: 1420, hmr: 1421 }, JustVoice: { dev: 1430, hmr: 1431 }, docgen: { dev: 1450, hmr: 1451 }, template: { dev: 9000 } },
  };
  // 17496–17498 are JustWrite's (its smoke scratch port, eval and flow tests)
  expect(nextPorts(before)).toEqual({ port: 17499, devPort: 1460, hmrPort: 1461 });
  // with that app registered, the following app gets the next ones
  const after = {
    appPorts: { ...before.appPorts, "just-house-paint": 17499 },
    devPorts: { ...before.devPorts, "just-house-paint": { dev: 1460, hmr: 1461 } },
  };
  expect(nextPorts(after)).toEqual({ port: 17500, devPort: 1470, hmrPort: 1471 });
  // and the live guard's registries read the same way
  expect(nextPorts(readRegistries(GUARD_SRC)).port).toBeGreaterThan(17498);
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
      'dataDirEnv: "JUST_HOUSE_PAINT_DATA_DIR", port: 17499, log: "just-house-paint.log", logger: "just_house_paint.app",',
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
  expect(regs.appPorts["just-house-paint"]).toBe(17499);
  expect(regs.devPorts["just-house-paint"]).toEqual({ dev: 1460, hmr: 1461 });
  expect(registerInGuard(out, names, ports, "just-house-paint")).toBe(out);
});

const TEMPLATE = (rel) => readFileSync(new URL(`../../../template/${rel}`, import.meta.url), "utf8");
const PURPOSE =
  "See your own house in real paint colors before you buy paint. You add a photo of your house; the app finds its parts.";

test("the purpose is the PRD's first paragraph under \"What it is for\" — never the template's placeholder", () => {
  const prd = `# PRD

## What it is for

See your own house in real paint colors before you buy paint. You add a photo
of your house; the app finds its parts.

The user's words: "…"

## Who uses it
`;
  expect(purposeFromPrd(prd)).toBe(PURPOSE);
  expect(purposeFromPrd(TEMPLATE("docs/dev/PRD.md"))).toBeNull();
  expect(purposeFromPrd("# PRD\n\n## Who uses it\n")).toBeNull();
});

test("README, AGENTS.md and package.json describe the app, not the template", () => {
  const readme = describeApp("README.md", TEMPLATE("README.md"), names, PURPOSE);
  expect(readme).toMatch(/^<!-- SPDX-License-Identifier: MIT -->\r?\n# Just House Paint\n\nSee your own house/);
  expect(readme).not.toContain("The complete reference app every family app starts from");
  expect(readme).toContain("\n## The shape");

  const agentsRaw = describeApp("AGENTS.md", TEMPLATE("AGENTS.md").replace("# Family Template", "# Just House Paint"), names, PURPOSE);
  // the file keeps its own line ends (a Windows checkout has CRLF)
  expect(agentsRaw.includes("\r\n")).toBe(TEMPLATE("AGENTS.md").includes("\r\n"));
  const agents = agentsRaw.replace(/\r\n/g, "\n");
  expect(agents).toMatch(/^# Just House Paint — instructions for any AI working in this repo\n\nSee your own house/);
  expect(agents).not.toContain("The family's reference app");
  expect(agents).toContain("\n## Commands");

  const pkg = JSON.parse(describeApp("package.json", TEMPLATE("package.json"), names, PURPOSE));
  expect(pkg.description).toBe("See your own house in real paint colors before you buy paint.");

  // without a PRD purpose: a marked placeholder, never the template's words
  expect(describeApp("README.md", TEMPLATE("README.md"), names, null)).toContain("*What this app is for");
  expect(JSON.parse(describeApp("package.json", TEMPLATE("package.json"), names, null)).description).toBe("Just House Paint — a family app.");
  // any other file is untouched
  expect(describeApp("src/App.vue", "<template/>", names, PURPOSE)).toBe("<template/>");
});

test("no phone app: an app is made without src-capacitor/, and --phone says why (2026-10-19)", () => {
  expect(parseArgs(["--name", "x"]).phone).toBe(false);
  expect(parseArgs(["--name", "x", "--no-phone"]).phone).toBe(false);
  expect(() => parseArgs(["--name", "x", "--phone"])).toThrow(/no in-app server/);
});
