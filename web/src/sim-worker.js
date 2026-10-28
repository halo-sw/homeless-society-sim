// Sim fallback worker: runs the life engine off the main thread.
//
// When the CLI output (/data/sim/<scenario>-<label>.json) is missing,
// the page asks this worker to simulate the requested homes instead.
// Same engine modules as the CLI, so file and worker runs agree
// byte-for-byte for the same inputs.
import { simulate } from "./engine/simulate.js";

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadArea(areaId) {
  const area = await fetchJson(`/data/${areaId}/area.json`);
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = await fetchJson(`/data/${areaId}/${value.$ref}`);
    }
  }
  return area;
}

async function loadRegion() {
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = await fetchJson(`/data/region/${file}`);
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}

self.onmessage = async (e) => {
  const { scenario: name, labels } = e.data || {};
  try {
    const scen = await fetchJson(`/scenarios/${name}.json`);
    const region = await loadRegion();
    const runs = {};
    for (const label of labels) {
      const home = scen.homes.find((h) => h.label === label);
      if (!home) throw new Error(`unknown home ${label}`);
      const area = await loadArea(home.area);
      runs[label] = simulate(area, structuredClone(scen), label,
        region ? { region } : {});
    }
    self.postMessage({ ok: true, runs });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
