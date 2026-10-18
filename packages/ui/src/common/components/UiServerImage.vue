<script setup>
// SPDX-License-Identifier: MIT
// Quasar's QImg for a picture the app's server holds — `path` is the server path
// ("/v1/houses/…/image?size=thumb"), loaded through the kit's transport by useServerImage (the
// bearer token, the phone's in-app server); every other attribute is QImg's (ratio, fit, alt, …).
// A path that fails shows QImg's empty frame and emits `error` with the kit's Error (§15).
import { QImg } from "quasar";
import { watch } from "vue";
import { useServerImage } from "../composables/useServerImage.js";

const props = defineProps({
  path: { type: String, default: "" },
});
const emit = defineEmits(["error"]);

const { src, error } = useServerImage(() => props.path);
watch(error, (e) => e && emit("error", e));
</script>

<template>
  <QImg :src="src || undefined" class="ui-server-image" />
</template>
