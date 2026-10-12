// SPDX-License-Identifier: MIT
// vue-i18n, installed as Quasar's CLI installs it (its i18n preset: a boot file that app.use()s the
// instance — quasar.dev/options/app-internationalization). Quasar's own words (the table pager, the
// date picker) follow the same language through Quasar's language packs. The kit's helper is
// imported by its path: the kit's index brings every kit view and their peer packages, which an app
// that installs the kit's UI (installLlmUi) has and this template doesn't.
import { defineBoot } from '#q-app'
import { followQuasarLang } from '@delebash/llm-ui/quasar/lang.js'
import { i18n } from '../i18n/index.js'

export default defineBoot(({ app }) => {
  app.use(i18n)
  followQuasarLang(i18n, import.meta.glob('../../node_modules/quasar/lang/*.js'))
})
