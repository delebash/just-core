<!-- SPDX-License-Identifier: MIT -->
<template>
  <q-page class="flex flex-center">
    <q-btn color="secondary" to="/" :label="t('second.toIndex')" no-caps />
  </q-page>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
