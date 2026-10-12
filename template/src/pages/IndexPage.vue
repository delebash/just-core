<!-- SPDX-License-Identifier: MIT -->
<template>
  <q-page class="flex flex-center">
    <div class="column items-center">
      <img
        :alt="t('index.logoAlt')"
        src="~@/assets/quasar-logo-vertical.svg"
        style="width: 200px; height: 200px"
      />

      <q-btn
        class="q-mt-md"
        color="primary"
        to="/second"
        :label="t('index.toSecond')"
        no-caps
      />
    </div>
  </q-page>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
