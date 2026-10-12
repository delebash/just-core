<!-- SPDX-License-Identifier: MIT -->
<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          :aria-label="t('layout.menu')"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title>
          {{ t('layout.title') }}
        </q-toolbar-title>

        <div>{{ t('layout.version', { version: $q.version }) }}</div>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
    >
      <q-list>
        <q-item-label
          header
        >
          {{ t('layout.links') }}
        </q-item-label>

        <EssentialLink
          v-for="link in linksList"
          :key="link.label"
          v-bind="link"
        />
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EssentialLink from '@/components/EssentialLink.vue'

const { t } = useI18n()

// A computed, so the words follow a language switch. Product names, sites and handles stay as
// written; the words are keys.
const linksList = computed(() => [
  {
    label: t('layout.link.docs'),
    caption: 'quasar.dev',
    icon: 'school',
    link: 'https://quasar.dev'
  },
  {
    label: 'GitHub',
    caption: 'github.com/quasarframework',
    icon: 'code',
    link: 'https://github.com/quasarframework'
  },
  {
    label: t('layout.link.discord'),
    caption: 'chat.quasar.dev',
    icon: 'chat',
    link: 'https://chat.quasar.dev'
  },
  {
    label: t('layout.link.forum'),
    caption: 'forum.quasar.dev',
    icon: 'record_voice_over',
    link: 'https://forum.quasar.dev'
  },
  {
    label: 'Twitter',
    caption: '@quasarframework',
    icon: 'rss_feed',
    link: 'https://twitter.quasar.dev'
  },
  {
    label: 'Facebook',
    caption: '@QuasarFramework',
    icon: 'public',
    link: 'https://facebook.quasar.dev'
  },
  {
    label: 'Quasar Awesome',
    caption: t('layout.link.awesome'),
    icon: 'favorite',
    link: 'https://awesome.quasar.dev'
  }
])

const leftDrawerOpen = ref(false)

function toggleLeftDrawer () {
  leftDrawerOpen.value = !leftDrawerOpen.value
}
</script>
