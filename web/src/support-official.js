// Keyed support-policy sources: adapter seam (stage 9b, Part C.4 — pure).
//
// Same pattern as education-official.js: the policy lists that need keys
// (온통청년 청년정책 API, 복지로/한국사회보장정보원 복지서비스 API) ship as
// an interface plus a fixture source shaped like the real payloads —
// fixtures only, no calls. When keys arrive, a keyed source implements the
// same interface server-side (keys never reach the browser) and the 지원
// 제도 views keep working.
//
// Documented in docs/support-official.md. Fixtures live beside the tests
// (web/tests/fixtures/support-official-*.json).

// source = {
//   id: "youth-center" | "bokjiro" | "fixture:...",
//   needsKey: bool,
//   async listPolicies({region?, maxAge?}) ->
//     [{title, org, min_age, max_age, summary, source_url}],
// }
//
// Ages are ints or null when the source states no bound; source_url is a
// string or null (unverified links stay null, like the checklist).
export function checkSupportSource(source) {
  const errors = [];
  if (!source || typeof source !== "object") return ["source must be an object"];
  if (typeof source.id !== "string" || !source.id) errors.push("source.id must be a non-empty string");
  if (typeof source.needsKey !== "boolean") errors.push("source.needsKey must be a boolean");
  if (typeof source.listPolicies !== "function") errors.push("source.listPolicies must be a function");
  return errors;
}

// Fixture source: serves caller-provided rows through the interface (no
// network, no key). Used by tests and by the UI's "official source" demo
// until a keyed source lands.
export function fixtureSupportSource({ id = "fixture:demo", policies = [] } = {}) {
  const rows = policies.map((r) => ({ ...r }));
  return {
    id,
    needsKey: false,
    async listPolicies({ maxAge = null } = {}) {
      return rows
        .filter((r) => maxAge === null || r.max_age === null || r.max_age === undefined
          || Number(maxAge) <= Number(r.max_age))
        .map((r) => ({ ...r }));
    },
  };
}

// Shape check for one policy row (fixture files and future API mappers).
export function checkPolicyRow(row) {
  const errors = [];
  if (!row || typeof row !== "object") return ["policy must be an object"];
  if (typeof row.title !== "string" || !row.title) errors.push("policy.title must be a non-empty string");
  if (typeof row.org !== "string" || !row.org) errors.push("policy.org must be a non-empty string");
  for (const f of ["min_age", "max_age"]) {
    if (row[f] !== null && row[f] !== undefined && !Number.isInteger(row[f])) {
      errors.push(`policy.${f} must be an int or null`);
    }
  }
  if (row.source_url !== null && row.source_url !== undefined && typeof row.source_url !== "string") {
    errors.push("policy.source_url must be a string or null");
  }
  return errors;
}
