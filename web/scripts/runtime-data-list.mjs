// Runtime data list (22a): which files under data/build the public site
// needs. The orchestrator packs exactly these into the release asset
// `runtime-data.tgz` (unpacks to data/…); the Pages workflow extracts it
// into web/dist/ so the site serves {BASE}data/… mirroring data/build/….
//
// Usage: node web/scripts/runtime-data-list.mjs [data/build-dir]
// Prints one relative path per line.
//
// Rules:
// - for every area/box directory (a dir holding area.json): area.json and
//   scene.json, plus every $ref target inside them, recursively;
// - all .json and .csv under homes/, region/ (including
//   congestion.json), sim/ and walkgraph/;
// - top-level *.json.
// - never _cache/, personas/, *.pbf, osm.json, graph.json or report.json
//   — unless something already in the list references them.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const EXCLUDED_BASENAMES = new Set(["osm.json", "graph.json", "report.json"]);
const DATA_SUBTREES = new Set(["homes", "region", "sim", "walkgraph"]);

function posix(rel) {
  return String(rel).split(sep).join("/");
}

function excluded(rel) {
  const p = posix(rel);
  if (p === "" || p.startsWith("_cache/") || p.includes("/_cache/")) return true;
  if (p.startsWith("personas/") || p.includes("/personas/")) return true;
  if (p.endsWith(".pbf")) return true;
  if (EXCLUDED_BASENAMES.has(p.split("/").pop())) return true;
  return false;
}

function collectRefs(node, into) {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, into);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") into.push(v);
      else collectRefs(v, into);
    }
  }
}

// Pure over a directory reader, so tests use a fake:
//   reader.files   — every file path relative to data/build (posix)
//   reader.readJson(rel) — Promise of the parsed JSON at rel
export async function runtimeDataList(reader) {
  const files = new Set((reader.files || []).map((f) => posix(f)));
  const out = [];
  const add = (p) => {
    if (!out.includes(p)) out.push(p);
  };
  const seen = new Set();
  async function addWithRefs(rel) {
    if (seen.has(rel) || !files.has(rel)) return;
    seen.add(rel);
    add(rel); // referenced files are listed even when excluded above
    let doc = null;
    try {
      doc = await reader.readJson(rel);
    } catch {
      return;
    }
    const refs = [];
    collectRefs(doc, refs);
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    for (const r of refs) {
      const clean = String(r).replace(/^\/+/, "");
      await addWithRefs(dir ? `${dir}/${clean}` : clean);
    }
  }
  const dirs = new Set();
  for (const f of files) {
    const i = f.lastIndexOf("/");
    if (i > 0) dirs.add(f.slice(0, i));
  }
  for (const d of [...dirs].sort()) {
    if (!files.has(`${d}/area.json`)) continue; // area/box directory
    await addWithRefs(`${d}/area.json`);
    if (files.has(`${d}/scene.json`)) await addWithRefs(`${d}/scene.json`);
  }
  for (const f of [...files].sort()) {
    const top = f.split("/")[0];
    if (!DATA_SUBTREES.has(top)) continue;
    if (!/\.(json|csv)$/.test(f)) continue;
    if (excluded(f)) continue;
    add(f);
  }
  for (const f of [...files].sort()) {
    if (f.includes("/")) continue;
    if (!f.endsWith(".json")) continue;
    if (excluded(f)) continue;
    add(f);
  }
  return out.sort();
}

async function walkFs(root, dir, into) {
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) await walkFs(root, rel, into);
    else if (e.isFile()) into.push(rel);
  }
}

const invoked = process.argv[1] && process.argv[1].endsWith("runtime-data-list.mjs");
if (invoked) {
  const here = new URL(".", import.meta.url);
  const defDir = new URL("../../data/build", here);
  const { fileURLToPath } = await import("node:url");
  const root = process.argv[2] || fileURLToPath(defDir);
  const files = [];
  await walkFs(root, "", files);
  const reader = {
    files,
    readJson: async (rel) => JSON.parse(await readFile(join(root, rel), "utf8")),
  };
  for (const p of await runtimeDataList(reader)) console.log(p);
}
