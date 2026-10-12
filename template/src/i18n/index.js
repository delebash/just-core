// SPDX-License-Identifier: MIT
// vue-i18n setup — the family's shape (../docs/app-structure.md §Q.11). The instance starts from
// the kit's catalogs (`kit.*`) and this app's own (./locales/<code>.json) are merged over them, so a
// `kit.*` key here rewords the kit's. A language is a file in ./locales/. The instance is exported,
// not created in the boot file, because non-component code translates too.
import { createI18n } from 'vue-i18n'
import { catalogsFromFiles, kitMessages } from '@delebash/llm-ui/i18n/index.js'

const own = catalogsFromFiles(import.meta.glob('./locales/*.json', { eager: true }))

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: kitMessages(),
  missingWarn: false,
  fallbackWarn: false
})
for (const [code, msgs] of Object.entries(own)) i18n.global.mergeLocaleMessage(code, msgs)
