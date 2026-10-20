<script setup>
// SPDX-License-Identifier: MIT
// The server didn't answer at start-up: the kit's connection-error screen, on its own route outside
// the layout (boot/familytemplate.js sends every route here while the server is down). The renderer
// has no data of its own, so nothing else loads without the server; Retry reloads the window, and
// the start-up then returns to the page the user was on — and asks the desktop shell for the
// server's address, which starts a server again whose start had failed. When the shell knows why
// (another program holds the port, another copy of the app holds the data folder), it says so.
// JustWrite's ConnectionErrorPage.vue is the donor.
import { ConnectionError, serverUrl } from "@delebash/ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { shellServerStatus } from "../services/native.js";

const { t } = useI18n();

const detail = ref("");
onMounted(async () => {
  const status = await shellServerStatus();
  if (status?.dataFolderInUse) detail.value = status.dataFolderInUse;
  // another OS user's copy of the app holds the port (the shell never stops it), or Windows reserved the port
  else if (status?.portOtherUser) detail.value = t("connectionError.portOtherUser", { port: status.portOtherUser, retry: t("kit.common.retry") });
  else if (status?.portReserved) detail.value = t("connectionError.portReserved", { port: status.portReserved });
  else if (status?.portTaken) detail.value = t("connectionError.portTaken", { port: status.portTaken, retry: t("kit.common.retry") });
  // the server's own first error line (a database it couldn't open, a data folder it couldn't use)
  else if (status?.serverError) detail.value = t("connectionError.serverError", { error: status.serverError });
});
</script>

<template>
  <ConnectionError
    :app-name="t('app.name')"
    :server-url="serverUrl('')"
    :need="t('connectionError.need')"
    :detail="detail"
    :dev-hint="t('connectionError.devHint')"
  />
</template>
