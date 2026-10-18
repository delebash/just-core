<!-- SPDX-License-Identifier: MIT -->
<script setup>
// A rule between groups of actions in a UiMenu (see UiMenu.vue); the kit's look (.lu-mmsep) unless
// the host gives its own class.
import { computed, useAttrs } from "vue";

const attrs = useAttrs();
const kitClass = computed(() => (attrs.class ? null : "lu-mmsep"));
</script>

<template>
  <div role="separator" aria-orientation="horizontal" :class="kitClass" />
</template>
