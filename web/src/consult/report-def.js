// Stage 29j3b: SUBMIT_REPORT_DEF lives here (no imports) so
// report.js and tools.js can both use it without an import cycle.
export const SUBMIT_REPORT_DEF = { type: "function", function: { name: "submit_report",
  description: "두 집 비교 리포트를 낸다 — 최종 비교는 이 도구로만 낸다. 코드가 숫자·근거를 검증하고, 실패하면 feedback_ko로 고쳐 다시 낸다.",
  parameters: { type: "object", additionalProperties: false,
    properties: { sentences: { type: "array", items: { type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        home: { type: "string" },
        item_id: { type: "string" },
        text_ko: { type: "string" },
        claims: { type: "array", items: { type: "object",
          properties: {
            field: { type: "string" },
            value: { type: "number" },
            unit: { type: "string" },
            member: { type: "string" },
          } } },
        evidence: { type: "array", items: { type: "string" } },
      },
      required: ["id", "home", "item_id", "text_ko"] } } },
    required: ["sentences"] } } };
