// SPDX-License-Identifier: MIT
// The app's ONE build config (Quasar CLI, app-structure §Q) — the renderer for every mode, the
// desktop app (Electron mode on the kit's runDesktopApp) and the phone app (Capacitor mode).
// Every family app's quasar.config.js is this file with its own names, ports and installer
// settings. https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import path from 'node:path'
import { defineConfig } from '#q-app'

// `npm run` hands an `allow-scripts` setting from the user's .npmrc to every child process as
// npm_config_allow_scripts, and npm 11 refuses it in the project installs Quasar spawns
// (EALLOWSCRIPTS). Each project declares its own `allowScripts`, which npm uses instead.
delete process.env.npm_config_allow_scripts

const root = import.meta.dirname
// The kit, consumed from source: its UI by the alias below, its core by the server package —
// the renderer imports the server's schemas (server/src/schemas/), which import the kit's
// browser-safe platform/schema.js. In an app the kit is the sibling checkout ../just-core.
const kitUi = path.resolve(root, '../packages/ui')
const kitCore = path.resolve(root, '../packages/core')

export default defineConfig(() => {
  return {
    // vue-i18n first (as Quasar's i18n preset wires it), then the renderer's start-up: the kit's UI,
    // error reporting, Help, the server check, the preferences, the warm start — awaited before
    // Quasar mounts the app (app-structure §Q.4).
    boot: ['i18n', 'familytemplate'],

    // The stylesheets in cascade order: the design tokens the family theme reads, the kit's own
    // (its AI views, its controls, its Quasar theme — `~` imports them as written, through the
    // alias), then the app's, so the app's rules win a tie with the kit's (JustWrite's order).
    css: [
      'tokens.css',
      // every font the Appearance picker offers, bundled (the kit's Fontsource set)
      '~@delebash/ui/common/fonts.css',
      '~@delebash/ui/styles.css',
      '~@delebash/ui/common/styles.css',
      '~@delebash/ui/quasar/theme.css',
      'app.scss',
    ],

    // No Quasar icon font or Roboto: the icons Quasar's components draw are the kit's line icons
    // (its icon set, installed by installLlmUi) and the type is the tokens' --font-ui.
    extras: [],

    build: {
      vueRouterMode: 'hash',

      alias: {
        '@renderer': path.join(root, 'src'),
        // The kit's UI, consumed from source for the dev/HMR loop (app-structure §3).
        '@delebash/ui': path.join(kitUi, 'src'),
      },

      extendViteConf (viteConf) {
        viteConf.resolve = viteConf.resolve || {}
        // The aliased kit imports its peer packages by bare name from its own folder: ONE copy of
        // each comes from this app's node_modules (Vue's provide/inject and reactivity, and
        // Quasar's, break with two) — the list every family app carries (§3).
        viteConf.resolve.dedupe = [
          ...(viteConf.resolve.dedupe || []),
          'vue', 'quasar', '@floating-ui/dom', 'pinia', 'vue-router', 'vue-i18n', 'marked',
          '@vueuse/core'
        ]
        viteConf.server = viteConf.server || {}
        // Never watched: the server, the development data folder (Chromium keeps its files
        // locked — EBUSY), the e2e harness, build output (§3, §Q.8).
        const ignored = [].concat(viteConf.server.watch?.ignored || [])
        viteConf.server.watch = {
          ...(viteConf.server.watch || {}),
          ignored: [ ...ignored, '**/server/**', '**/data/**', '**/e2e/**', '**/dist/**' ]
        }
        // The dev server reads the repo (docs/ for Help), the kit's UI, and the kit's core
        // (platform/schema.js, through the server's schemas).
        viteConf.server.fs = { ...(viteConf.server.fs || {}), allow: [ root, kitUi, kitCore ] }
      },
    },

    devServer: {
      // The app's registered dev port (the guard's DEV_PORTS, app-structure §1): the kit's
      // origin-aware resolver knows it (installLlmUi devPorts) and the server's CSRF guard allows
      // it (server/src/app.js APP_ORIGINS). A new app takes the next free one.
      host: '127.0.0.1',
      port: 9000,
      strictPort: true,
      open: false
    },

    framework: {
      // the family's Quasar settings (app-structure §Q.4): no Material ripple; Notify for the
      // kit's toasts (pushToast)
      config: { ripple: false },
      plugins: ['Notify']
    },

    animations: [],

    capacitor: {
      hideSplashscreen: true
    },

    electron: {
      // The main process's dependencies (src-electron/package.json) are local packages — the
      // app's server/ and the family kit — named by `file:` paths relative to src-electron/.
      // Quasar copies them unchanged into dist/electron/UnPackaged/package.json, two folders
      // further down, so they're made absolute here. The root's `workspaces` and `lint-staged`
      // fields are copied too and mean nothing there.
      extendElectronPackageJson (pkgJson) {
        delete pkgJson.workspaces
        delete pkgJson['lint-staged']
        for (const [name, spec] of Object.entries(pkgJson.dependencies || {})) {
          if (typeof spec === 'string' && spec.startsWith('file:')) {
            pkgJson.dependencies[name] = `file:${path.resolve(root, 'src-electron', spec.slice(5))}`
          }
        }
      },

      // …and installed as real copies with their production dependencies only — a `file:` link
      // would bring the linked folder's whole node_modules, development tools included
      unPackagedInstallParams: [ 'install', '--install-links' ],

      preloadScripts: [ 'electron-preload' ],

      inspectPort: 5858,

      // the family packages with electron-builder (installers: NSIS on Windows)
      bundler: 'builder',

      builder: {
        // https://www.electron.build/configuration
        appId: 'com.familytemplate.app',
        productName: 'Family Template',
        // better-sqlite3's build leftovers (sources, object files, debug symbols) stay out
        files: [
          '**/*',
          '!**/node_modules/better-sqlite3/{deps,src,build/Release/obj,build/Release/obj.target,build/deps}/**',
          '!**/node_modules/better-sqlite3/build/Release/*.{pdb,iobj,ipdb,lib,exp}'
        ],
        // native modules can't load from inside the asar archive (the server itself runs from it)
        asarUnpack: [ '**/*.node' ],
        // the headless launcher (family-template-server.cmd) beside the exe — the app's own exe
        // run as Node on its server package (§Q.3)
        extraResources: [ { from: path.join(root, 'build', 'launcher'), to: '..' } ],
        // the exe never shares the headless launcher's name (§Q.3)
        win: { target: 'nsis', executableName: 'familytemplate' },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          // the kit's installer steps (the data folder beside the exe, kept on uninstall)
          include: path.join(kitCore, 'src', 'shell', 'installer.nsh')
        },
        // Electron's fuses (electronjs.org/docs/latest/tutorial/fuses) — the three apps' block:
        // runAsNode stays on for the headless launcher; e2e drives the unfused UnPackaged build
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: false,
          enableNodeCliInspectArguments: false,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          grantFileProtocolExtraPrivileges: false
        },
        mac: { category: 'public.app-category.productivity' },
        linux: { target: [ 'AppImage', 'deb' ], category: 'Office' }
      }
    }
  }
})
