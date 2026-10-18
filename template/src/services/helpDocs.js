// SPDX-License-Identifier: MIT
// In-app Help over docs/*.md — the host half of the kit's Help system (configureHelp in the boot
// file; the kit's HelpDrawer shows a page, a PaneHeader's `help-key` opens one). The adapter's
// logic (README → index, lazy load and cache, titles from the table of contents) is the kit's
// makeDocsHelpAdapter; what stays here is what Vite resolves relative to THIS file: the glob over
// the pages and the toc import. docs/whats-new.md also feeds Settings → Updates.
import { makeDocsHelpAdapter } from "@delebash/ui";
import toc from "../../docs/toc.json";

export const { loadDoc, hasDoc, titleForSlug } = makeDocsHelpAdapter(
  import.meta.glob("../../docs/*.md", { query: "?raw", import: "default" }),
  toc,
);
