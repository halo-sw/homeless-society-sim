import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, glossDef, glossaryTerms } from "../src/ui/glossary.js";

const REQUIRED = ["전세", "월세", "매매", "전세가율", "LTV", "DSR",
  "확정일자", "전입신고", "전세보증보험", "공공임대", "주거비 부담률"];

describe("glossary", () => {
  it("covers the eleven briefed terms with plain-Korean definitions", () => {
    assert.deepEqual(glossaryTerms(), REQUIRED);
    assert.equal(GLOSSARY.length, 11);
    for (const g of GLOSSARY) {
      assert.ok(g.def && g.def.length >= 10, g.term);
      assert.ok(/[가-힣]/.test(g.def), g.term); // plain Korean, not a bare URL
      if (g.source_url !== null) {
        assert.match(g.source_url, /^https:\/\//, g.term);
      }
    }
  });

  it("links official terms to their official sources", () => {
    assert.equal(glossDef("확정일자").source_url, "https://www.iros.go.kr");
    assert.equal(glossDef("전입신고").source_url, "https://www.gov.kr");
    assert.equal(glossDef("전세보증보험").source_url, "https://www.khug.or.kr");
    assert.equal(glossDef("공공임대").source_url, "https://www.lh.or.kr");
    assert.equal(glossDef("LTV").source_url, "https://www.fsc.go.kr");
    assert.equal(glossDef("DSR").source_url, "https://www.fsc.go.kr");
    // Market shorthand carries no official link.
    assert.equal(glossDef("전세가율").source_url, null);
    assert.equal(glossDef("주거비 부담률").source_url, null);
  });

  it("looks up verbatim and misses cleanly", () => {
    assert.equal(glossDef("전세").term, "전세");
    assert.equal(glossDef(" 전세 "), glossDef("전세"));
    assert.equal(glossDef("깡통전세"), null);
    assert.equal(glossDef(""), null);
    assert.equal(glossDef(null), null);
  });
});
