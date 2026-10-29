// Estimated model prices in one file (13, Part 4). All costs derived
// from this table are labelled 추정 — they are our arithmetic on the
// provider's list price, not a bill.

export const PRICE_TABLE = {
  meta: {
    provider: "meta",
    model: "muse-spark-1.3",
    // USD per 1M tokens (list price as of 2026-10-29, may change).
    inputPer1M: 1.5,
    outputPer1M: 4.5,
    reasoningPer1M: 4.5, // reasoning tokens bill as output
    asOf: "2026-10-29",
    note: "추정 — Meta list price 기준, 실제 청구는 다를 수 있어요",
  },
  baseten: {
    provider: "baseten",
    model: "meta-models/muse-spark-open-1026",
    inputPer1M: 0.8,
    outputPer1M: 2.4,
    reasoningPer1M: 2.4,
    asOf: "2026-10-29",
    note: "추정 — Baseten list price 기준, 실제 청구는 다를 수 있어요",
  },
  recorded: {
    provider: "recorded",
    model: "recorded",
    inputPer1M: 0,
    outputPer1M: 0,
    reasoningPer1M: 0,
    asOf: "2026-10-29",
    note: "키 없이 보는 기록된 답변 — 비용 없음",
  },
};

export function priceFor(provider) {
  return PRICE_TABLE[provider] || null;
}

export function estimateCostUsd(provider, usage) {
  const p = priceFor(provider);
  if (!p || !usage) return 0;
  const input = usage.input_tokens || usage.prompt_tokens || 0;
  const output = usage.output_tokens || usage.completion_tokens || 0;
  const reasoning = usage.reasoning_tokens || 0;
  // Reasoning is part of completion tokens — don't double count.
  const plain = Math.max(0, output - reasoning);
  return (
    (input * p.inputPer1M + plain * p.outputPer1M + reasoning * p.reasoningPer1M)
    / 1_000_000
  );
}
