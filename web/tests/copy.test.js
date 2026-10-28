import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BANNED_LABEL_JARGON, ALLOWED_LONG_PHRASES, TENURE_PLAIN_LEAD,
  monthlyHousingLabel, BURDEN_PLAIN_LABEL, REMAINING_PLAIN_LABEL } from "../src/ui/copy.js";
import { glossDef } from "../src/ui/glossary.js";
import { PRIORITY_METRICS } from "../src/priorities.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

// A label literal fails when it contains a banned bare-jargon phrase and
// no allowed longer plain phrase covering it.
function bannedIn(label) {
  for (const phrase of BANNED_LABEL_JARGON) {
    if (!label.includes(phrase)) continue;
    const covered = ALLOWED_LONG_PHRASES.some((long) =>
      long.includes(phrase) && label.includes(long));
    if (!covered) return phrase;
  }
  return null;
}

// label="..." / label='...' / label={`...`} / label: "..." literals with
// ${...} interpolations blanked (aria-label excluded: a11y, not a label).
function labelLiterals(text) {
  const out = [];
  const re = /(?<![\w-])label\s*[:=]\s*(\{?\s*)(["'`])((?:\\\2|(?!\2).)*)\2/g;
  for (const m of text.matchAll(re)) {
    out.push(m[3].replace(/\$\{[^}]*\}/g, ""));
  }
  return out;
}

async function uiJsxFiles() {
  return (await readdir(join(WEB, "src", "ui")))
    .filter((f) => f.endsWith(".jsx"));
}

describe("plain-words copy guide", () => {
  it("no label literal carries banned bare jargon", async () => {
    const files = [
      ...(await uiJsxFiles()).map((f) => join("src", "ui", f)),
      join("src", "engine", "simulate.js"),
      join("src", "priorities.js"),
    ];
    for (const f of files) {
      const text = await readFile(join(WEB, f), "utf8");
      for (const literal of labelLiterals(text)) {
        const hit = bannedIn(literal);
        assert.equal(hit, null, `${f}: label ${JSON.stringify(literal)} carries ${JSON.stringify(hit)}`);
      }
    }
  });

  it("resolved money labels carry no banned bare jargon", () => {
    const labels = [
      ...Object.keys(TENURE_PLAIN_LEAD).map(monthlyHousingLabel),
      monthlyHousingLabel("unknown-tenure"),
      BURDEN_PLAIN_LABEL, REMAINING_PLAIN_LABEL,
    ];
    for (const label of labels) {
      assert.equal(bannedIn(label), null, label);
    }
    for (const m of PRIORITY_METRICS) {
      assert.equal(bannedIn(m.label), null, `${m.id}: ${m.label}`);
    }
    assert.ok(BANNED_LABEL_JARGON.length >= 15);
  });

  it("every glossary term used in the UI is defined", async () => {
    for (const f of await uiJsxFiles()) {
      const text = await readFile(join(WEB, "src", "ui", f), "utf8");
      for (const m of text.matchAll(/term\s*=\s*["']([^"']+)["']/g)) {
        assert.ok(glossDef(m[1]), `${f}: undefined glossary term ${JSON.stringify(m[1])}`);
      }
    }
  });
});
