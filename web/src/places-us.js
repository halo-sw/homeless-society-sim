// US workplaces the chat resolves without a network or keys (26c,
// client-safe). Only Meta HQ in Menlo Park for now.

export const US_REGION_ID = "us-menlo";

export const US_WORKPLACES = [
  {
    id: "meta-hq",
    name: "Meta HQ (1 Hacker Way)",
    lon: -122.14823,
    lat: 37.48485,
    region: US_REGION_ID,
    aliases: [
      "meta hq",
      "meta",
      "facebook",
      "1 hacker way",
      "hacker way",
      "menlo park campus",
      "meta headquarters",
      "메타 본사",
      "메타",
      "페이스북",
    ],
  },
];

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HAS_LATIN = /[a-zA-Z]/;

// findUsWorkplace(text): case-insensitive; Latin aliases match on word
// boundaries, longest alias first. Returns { place, evidence } or null.
export function findUsWorkplace(text) {
  const src = String(text || "");
  if (!src) return null;
  let best = null;
  for (const place of US_WORKPLACES) {
    const sorted = [...(place.aliases || [])].sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      if (!alias) continue;
      if (HAS_LATIN.test(alias)) {
        const m = new RegExp(`\\b${escapeRe(alias)}\\b`, "i").exec(src);
        if (m) {
          if (!best || alias.length > best.alias.length) {
            best = { place, evidence: m[0], alias };
          }
          break;
        }
      } else if (src.includes(alias)) {
        if (!best || alias.length > best.alias.length) {
          best = { place, evidence: alias, alias };
        }
        break;
      }
    }
  }
  if (!best) return null;
  return { place: best.place, evidence: best.evidence };
}
