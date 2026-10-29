// SPDX-License-Identifier: MIT
// A model's answer as safe HTML, for v-html: Markdown through marked (GFM, a single line break kept), then DOMPurify.
// The answer is untrusted text — a model can write HTML or a `javascript:` link — and marked doesn't sanitize (its
// README: use a sanitize library, DOMPurify recommended). So raw HTML in the answer shows as text, DOMPurify keeps
// HTML's own elements only (no SVG or MathML, no handler, no script URL), and a web link opens outside the app
// (target=_blank, rel=noopener noreferrer). Trusted docs (the Help pages) go through renderHelpMarkdown instead.
// `marked` and `dompurify` resolve from the host app (peerDependencies).

import DOMPurify from "dompurify";
import { Marked } from "marked";

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// its own instance: the Help renderer's options and link rewrites never apply to a model's text
const md = new Marked({ gfm: true, breaks: true, async: false });
// raw HTML, a block or inline, is the model's text — shown, not rendered
md.use({ renderer: { html: ({ text }) => escapeHtml(text) } });

// DOMPurify's own instance (DOMPurify(window) makes one), so its hook touches no other caller's sanitizing
let purify = null;
function sanitizer() {
  if (purify) return purify;
  purify = DOMPurify(window);
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") || "")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return purify;
}

/** A model's Markdown answer → sanitized HTML ("" for none). */
export function renderAiMarkdown(text) {
  if (text == null || text === "") return "";
  return sanitizer().sanitize(md.parse(String(text)), { USE_PROFILES: { html: true } });
}
