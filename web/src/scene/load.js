// Scene loading (no three.js, no DOM): scene.json next to area.json,
// or null when the box has none (boundary areas fall back to flat).

export async function loadScene(areaId, fetchJson) {
  try {
    return await fetchJson(`/data/${areaId}/scene.json`);
  } catch (err) {
    console.warn(`[scene] no scene.json for ${areaId}, flat fallback (${err.message})`);
    return null;
  }
}
