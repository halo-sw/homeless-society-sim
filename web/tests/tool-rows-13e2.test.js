// Stage 13e2-5: tool rows say the label once — summaries carry only
// the result, durations read 0.2초 / 61ms style.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RECORDED_AGENT_REPLIES } from "../src/ui/demotour.js";
import { TOOL_ACTION_KO, stripToolLabel, toolActionKo,
  toolDurationKo } from "../src/ui/agent-float.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("13e2 tool rows", () => {
  it("no stripped target starts with its own label", () => {
    for (const [name, label] of Object.entries(TOOL_ACTION_KO)) {
      assert.equal(stripToolLabel(name, label), "", name);
      const rest = stripToolLabel(name, `${label} 6곳`);
      assert.equal(rest, "6곳", name);
      assert.ok(!rest.startsWith(label), name);
      assert.equal(stripToolLabel(name, "6곳 · 출퇴근 짧은 순"),
        "6곳 · 출퇴근 짧은 순", `${name} keeps result-only text`);
    }
    assert.equal(stripToolLabel("find_homes", undefined), "");
    assert.equal(stripToolLabel("unknown_tool", "whatever"), "whatever");
  });

  it("recorded replies strip to result-only targets", () => {
    let n = 0;
    for (const rec of Object.values(RECORDED_AGENT_REPLIES)) {
      for (const t of rec.tools || []) {
        n++;
        const target = stripToolLabel(t.name, t.summary);
        const label = toolActionKo(t.name);
        assert.ok(target === "" || !target.startsWith(label),
          `${t.name}: ${JSON.stringify(target)}`);
      }
    }
    assert.ok(n > 0, "recorded tools covered");
  });

  it("chat summaries carry only the result", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(src.includes('summary: ex.value.ok ? "" : "읽기 실패"'),
      "extract summary");
    assert.ok(src.includes("${result.candidates.length}곳 · ${HOME_SORT_KO[sort]}"),
      "find_homes summary");
    assert.ok(src.includes("summary: picked.map((p) => displayNameFor(p))"),
      "build_scenario summary");
    assert.ok(src.includes('`${noCommute ? "출근 없이 · " : ""}30일 · ${labels.join'), "run summary");
    assert.ok(src.includes("${compare.metrics.length}개 지표"), "compare summary");
    assert.ok(!src.includes("집 후보 ${result.candidates.length}곳(정렬"),
      "no repeated label");
    assert.ok(src.includes("stripToolLabel(t.name, t.summary)"),
      "recorded replies stripped");
  });

  it("durations read 0.2초 / 61ms style", () => {
    assert.equal(toolDurationKo(0), "0ms");
    assert.equal(toolDurationKo(3), "3ms");
    assert.equal(toolDurationKo(61), "61ms");
    assert.equal(toolDurationKo(99), "99ms");
    assert.equal(toolDurationKo(100), "0.1초");
    assert.equal(toolDurationKo(200), "0.2초");
    assert.equal(toolDurationKo(1500), "1.5초");
    assert.equal(toolDurationKo(undefined), "0ms");
    const consult = readFileSync(join(HERE, "..", "src", "ui", "consult.jsx"), "utf8");
    assert.ok(consult.includes("toolDurationKo(r.ms)"), "ToolRows uses it");
  });
});
