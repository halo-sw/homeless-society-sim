// Sim fallback worker: runs the life engine off the main thread.
//
// When the CLI output (/data/sim/<scenario>-<label>.json) is missing,
// the page asks this worker to simulate the requested homes instead.
// Same engine modules as the CLI, so file and worker runs agree
// byte-for-byte for the same inputs.
//
// 12b: also accepts an inline scenario ({scenarioInline, labels}) for
// chat-picked homes, with per-home progress posts
// ({progress: {done, total, label}}). Callers must ignore progress
// posts (they carry no runs).
import { simulate } from "./engine/simulate.js";
import { assetUrl } from "./paths.js";

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadArea(areaId) {
  const area = await fetchJson(assetUrl(`/data/${areaId}/area.json`));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = await fetchJson(assetUrl(`/data/${areaId}/${value.$ref}`));
    }
  }
  return area;
}

async function loadRegion() {
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = await fetchJson(assetUrl(`/data/region/${file}`));
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}

self.onmessage = async (e) => {
  const { scenario: name, scenarioInline, labels } = e.data || {};
  const post = (msg) => self.postMessage(msg);
  try {
    const scen = scenarioInline || await fetchJson(assetUrl(`/scenarios/${name}.json`));
    const region = await loadRegion();
    const runs = {};
    const list = Array.isArray(labels) ? labels : [];
    for (let i = 0; i < list.length; i++) {
      const label = list[i];
      post({ ok: true, progress: { done: i, total: list.length, label } });
      const home = scen.homes.find((h) => h.label === label);
      if (!home) throw new Error(`unknown home ${label}`);
      const area = await loadArea(home.area);
      runs[label] = simulate(area, structuredClone(scen), label,
        region ? { region } : {});
      post({ ok: true, progress: { done: i + 1, total: list.length, label } });
    }
    post({ ok: true, runs });
  } catch (err) {
    post({ ok: false, error: String((err && err.message) || err) });
  }
};
