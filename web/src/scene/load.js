// Scene loading (no three.js, no DOM): scene.json next to area.json,
// or null when the box has none (boundary areas fall back to flat).

// 14b: plain JSON arrays -> typed arrays at the loader boundary.
// Positions/colours/uvs become Float32Array; indices become Uint16Array
// when max < 65536, else Uint32Array. Already-typed input passes through.
export function toTypedMesh(data) {
  const f32 = (v) => (v instanceof Float32Array ? v : new Float32Array(v || []));
  let indices = data.indices;
  if (!(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    const arr = indices || [];
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    indices = max < 65536 ? new Uint16Array(arr) : new Uint32Array(arr);
  }
  return {
    ...data,
    positions: f32(data.positions),
    colors: f32(data.colors),
    uvs: data.uvs == null ? data.uvs : f32(data.uvs),
    indices,
  };
}

import { assetUrl } from "../paths.js";

export async function loadScene(areaId, fetchJson) {
  try {
    return await fetchJson(assetUrl(`/data/${areaId}/scene.json`));
  } catch (err) {
    console.warn(`[scene] no scene.json for ${areaId}, flat fallback (${err.message})`);
    return null;
  }
}
