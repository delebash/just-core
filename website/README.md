<!-- SPDX-License-Identifier: MIT -->
# The family's website parts

Every family app's website (its own repository, `<app>-website` — JustWrite's `justwrite-website`, house-paint's
`just-house-paint-website`, docgen's `just-ai-i18n-docgen-website`) is built the same way: Astro + Starlight on GitHub
Pages, its user docs taken from the app's latest release, published only when the user runs it. These three files are
the way — a site copies them **as they are**, and the family guard (`scripts/check-family.js`, check 26) checks every
site beside the kit against them:

| File | What |
|---|---|
| `scripts/sync-docs.js` | the app's `docs/*.md` into Starlight's collection — from the latest release's `docs.tar.gz` (or, for a release made before the app attached it, the tag's source), or `--from local` from the app's repo beside the site |
| `scripts/deploy.js` | `npm run deploy`: says which release's docs go live, asks, then runs the site's own workflow (the user's `gh` login — no token anywhere) |
| `.github/workflows/deploy.yml` | the build and the GitHub Pages deploy — `workflow_dispatch` only: nothing builds by itself, and no other workflow starts it; `publish: false` (`npm run deploy -- --dry-run`) builds and uploads without deploying |

A site's `package.json` names its app and itself, runs the scripts, and has `front-matter` (sync-docs reads a doc's
front-matter with it: the block never reaches the page, and its `lede:` is the page's description):

```json
"scripts": {
  "predev": "node scripts/sync-docs.js --from local --silent-if-missing",
  "prebuild": "node scripts/sync-docs.js --from release --silent-if-missing",
  "deploy": "node scripts/deploy.js"
},
"justSite": { "appRepo": "delebash/just-house-paint", "appDir": "../just-house-paint", "siteRepo": "delebash/just-house-paint-website" }
```

The app's release (the template's `.github/workflows/release.yml`) attaches `docs.tar.gz` while the release is still a
draft and starts nothing else; after a release, the user runs `npm run deploy` in the site. Each site's look — its
pages, components and styles — is its own (app-structure §19, "An app's website").
