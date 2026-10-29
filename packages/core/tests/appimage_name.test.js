// SPDX-License-Identifier: MIT
// The guard's AppImage-name rule (scripts/lib/appimage-name.js): electron-builder 26 names an AppImage from the product
// name unless the linux block names an executableName, and refuses an "&" there — docgen's Linux release build stopped.
import { expect, test } from "vitest";
import { appImageNameProblem } from "../../../scripts/lib/appimage-name.js";

const config = (productName, linux) => `export default {\n  electron: {\n    builder: {\n      productName: '${productName}',\n      win: {\n        executableName: 'win_name'\n      },\n      linux: {\n        target: [ 'AppImage' ],${linux}\n      }\n    }\n  }\n}\n`;

test("a product name with an \"&\" needs the linux block's executableName — the Windows one doesn't count", () => {
  expect(appImageNameProblem(config("Just AI i18n & DocGen", ""))).toMatch(/productName "Just AI i18n & DocGen" .* executableName/);
  expect(appImageNameProblem(config("Just AI i18n & DocGen", "\n        executableName: 'just_ai_i18n_docgen'"))).toBeNull();
});

test("a name of letters, digits, hyphens, underscores, dots and spaces needs nothing", () => {
  expect(appImageNameProblem(config("Just House Paint", ""))).toBeNull();
  expect(appImageNameProblem(config("Family Template v2.1_beta-x", ""))).toBeNull();
});
