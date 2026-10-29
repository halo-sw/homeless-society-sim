// 13e2: count how many named Commons photos each photo-filter rule
// removes. Usage: node scripts/photo-rule-counts-13e2.js (from web/).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { irrelevantReason } from "../src/places/photo-filter.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const named = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "places", "commons-named.json"), "utf8"));
const items = named.items || [];

const byRule = {};
const byKind = {};
let kept = 0;
for (const item of items) {
  const kind = item.kind || "street";
  const reason = irrelevantReason(item, kind);
  const key = `${kind}/${reason || "kept"}`;
  byKind[key] = (byKind[key] || 0) + 1;
  if (!reason) {
    kept++;
    continue;
  }
  byRule[reason] = (byRule[reason] || 0) + 1;
}

console.log(`photos: ${items.length}, kept: ${kept}, removed: ${items.length - kept}`);
console.log("--- by rule ---");
for (const [reason, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`${reason}: ${n}`);
}
console.log("--- by kind/reason ---");
for (const [key, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`${key}: ${n}`);
}
