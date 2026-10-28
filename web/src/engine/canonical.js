// Canonical JSON for engine runs (pure).
//
// Rules: object keys sorted (UTF-16 code-unit order) at every depth,
// arrays keep their order, integers print as-is, non-integers round to
// 3 decimals (round-half-away via Math.round on the scaled value).
// Two runs from the same inputs serialise byte-identically; the CLI
// writes canon(run) + "\n" and the byte-identity test hashes that.

export function canonNumber(x) {
  if (!Number.isFinite(x)) return "null";
  if (Number.isInteger(x)) return String(x);
  const r = Math.round(x * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

function quote(s) {
  return JSON.stringify(s);
}

export function canon(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return canonNumber(value);
  if (typeof value === "string") return quote(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${quote(k)}:${canon(value[k])}`);
  return `{${parts.join(",")}}`;
}
