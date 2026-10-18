// SPDX-License-Identifier: MIT
// A picture the app's server holds, for an <img> or Quasar's QImg: fetched through the kit's
// transport (requestBlob — the bearer token when Settings → Server requires one, the phone's in-app
// server, the §15 error parts) and shown as an object URL. A plain `<img src=serverUrl(...)>` sends
// no Authorization header — on a headless server with access tokens the picture never shows — and
// can't reach the phone's in-app server at all (just-house-paint found it, 2026-10-18).
//
//   const { src, error, loading } = useServerImage(() => `/v1/houses/${id}/image?size=thumb`);
//
// `path` is a string, a ref or a getter; a falsy path shows nothing. When the path changes, the old
// URL is released once the new picture has arrived; an answer that arrives after a newer request
// is dropped. Everything is released when the scope ends (the component unmounts).
import { onScopeDispose, ref, toValue, watch } from "vue";
import { requestBlob } from "../services/serverApi.js";

export function useServerImage(path, { fetchBlob = requestBlob } = {}) {
  const src = ref("");
  const error = ref(null);
  const loading = ref(false);
  let current = "";
  let seq = 0;

  const release = () => {
    if (current) URL.revokeObjectURL(current);
    current = "";
  };

  async function load(p) {
    const mine = ++seq;
    if (!p) {
      release();
      src.value = "";
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const blob = await fetchBlob(p);
      if (mine !== seq) return; // a newer path was asked for meanwhile
      const url = URL.createObjectURL(blob);
      release();
      current = url;
      src.value = url;
      error.value = null;
    } catch (e) {
      if (mine !== seq) return;
      error.value = e;
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  watch(() => toValue(path), load, { immediate: true });
  onScopeDispose(() => {
    seq++;
    release();
  });

  return { src, error, loading, reload: () => load(toValue(path)) };
}
