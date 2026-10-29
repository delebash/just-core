# Notices

Code in this repository that was copied or ported from another project, with its licence. The full
licence notice of each is kept in the file named; the family rule is `docs/family-rules.md`.

## The family's website parts (`website/`)

- **`website/scripts/sync-docs.js`** and **`website/.github/workflows/deploy.yml`** — from justwrite-website's
  `scripts/sync-docs.mjs` and `deploy.yml` (the docs from the app's release into Starlight's collection; the Pages
  build), made generic (the site's `package.json` `justSite`) and run by hand only. MIT License, Copyright (c) 2026
  JustWrite contributors.

## The UI kit (`ui/`)

- **`packages/ui/src/common/components/tableRows.js`** — UiTable's global filter, sort functions, automatic
  sort choice, first direction and click cycle, ported from TanStack Table's table-core 8
  (`sortingFns`, `features/RowSorting`, `utils/getSortedRowModel`, `features/GlobalFiltering`).
  MIT License, Copyright (c) 2016 Tanner Linsley.
- **`packages/ui/src/common/services/toastBridge.js`** — the toasts' four kind icons, Heroicons paths (MIT
  License, Copyright (c) Tailwind Labs, Inc.) as vue-sonner 2.0.9 shipped them. MIT License,
  Copyright (c) 2022 Yunwei Xiao.
- **`packages/ui/src/common/iconPaths.js`** — the `Info` icon, Lucide's "info" (lucide-static 1.60.0), derived from
  Feather. ISC License, Copyright (c) 2026 Lucide Icons and Contributors; MIT License, Copyright (c) 2013-present
  Cole Bemis. Both notices are in the file beside the icon.
- **`packages/ui/src/common/services/isolate.js`** — the strong left-to-right and right-to-left character
  ranges (`ltrChars_`, `rtlChars_`) of Google Closure Library's `closure/goog/i18n/bidi.js`. Apache License 2.0,
  Copyright The Closure Library Authors.

- **`packages/ui/src/common/fonts.css`** — bundles font files from the Fontsource packages it imports (Inter,
  Spline Sans, Geist, Hanken Grotesk, Albert Sans, Manrope, DM Sans, Atkinson Hyperlegible, Fraunces, Source Serif 4,
  Newsreader, Libre Caslon Text, Playfair Display, EB Garamond, Spectral, Spline Sans Mono). Each font is under the
  SIL Open Font License 1.1; its copyright and licence are in the package's `LICENSE` file
  (`packages/ui/node_modules/@fontsource/<family>/LICENSE`), and the OFL requires shipping that notice with the fonts.

The apps that bundle the kit list these in their own `NOTICE.md` too.
