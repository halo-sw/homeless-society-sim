// Stage 16a part 4: verify loop (pure, no DOM / network).
//
// verifyReport checks one report against one run: deterministic claims
// (numbers.js) and judge evidence (evidence.js). Coverage counts only
// engine-backed items (supported|partial): an item is covered when it
// has at least one sentence and none of its sentences failed. Items
// with engine:"none" land in `unsupported` — never covered, never
// failed — and a must among them is flagged with "엔진이 아직 확인할
// 수 없는 필수 항목". Pass needs zero failures, supported-must 100 %
// and supported-weighted >= 0.8.
//
// Personas without a scenario (persona_map → null: remote_worker,
// multigen_family, pet_owner until the deadline) return
// { status: "미지원", reason_ko, pass: false } and never pass.
//
// runVerifyLoop retries a failing report through an injected revise()
// (maxRetries from the ground truth, 3); after the last fail it hands
// off to the user (on_fail_after_retries: "escalate_to_user").

import { loadGroundTruth, roundCoverage } from "./checklist.js";
import { checkNumberClaims } from "./numbers.js";
import { checkEvidence } from "./evidence.js";

export const UNSUPPORTED_PERSONA_KO = "이 가족 유형은 아직 시뮬레이션 시나리오가 없어요";
export const UNSUPPORTED_MUST_KO = "엔진이 아직 확인할 수 없는 필수 항목";

// `persona` is a persona key or loadGroundTruth's return; opts.groundTruth
// (the parsed ground_truth.json) is required for the persona map.
export function verifyReport(report, run, persona, opts = {}) {
  const { groundTruth = null, inapplicable = [], extraFailures = [] } = opts;
  if (!groundTruth) throw new Error("verifyReport needs opts.groundTruth");
  const loaded = typeof persona === "string"
    ? loadGroundTruth(groundTruth, persona)
    : persona;
  const personaKey = loaded.persona;
  const personaMap = groundTruth.persona_map || {};
  if (personaMap[personaKey] === null) {
    return { status: "미지원", reason_ko: UNSUPPORTED_PERSONA_KO, pass: false };
  }
  const inapSet = inapplicable instanceof Set ? inapplicable : new Set(inapplicable || []);
  const items = loaded.items || [];
  const acceptance = loaded.acceptance || groundTruth.acceptance;
  const failures = [
    ...checkNumberClaims(report, run, loaded).failures,
    ...checkEvidence(report, run, loaded).failures,
    ...(extraFailures || []),
  ];
  const failedItems = new Set(failures.map((f) => f.item_id));
  const sentIds = new Set(
    ((report && report.sentences) || []).map((s) => s.item_id));
  const byId = new Map(items.map((it) => [it.id, it]));
  // 29j1: inapplicable items count neither as covered nor missing.
  const inapplicableList = items
    .filter((it) => inapSet.has(it.id) && it.engine !== "none")
    .map((it) => ({ item_id: it.id, reason_ko: "이 집 기록에 해당 장면이 없어요" }));
  const supported = items.filter((it) => it.engine !== "none" && !inapSet.has(it.id));
  const unsupported = items
    .filter((it) => it.engine === "none")
    .map((it) => ({ item_id: it.id,
      reason_ko: it.priority === "must"
        ? `${UNSUPPORTED_MUST_KO}이에요 (미지원)`
        : "엔진이 아직 확인할 수 없어요 (미지원)" }));
  const w = acceptance.weights;
  const covered = supported.filter((it) => sentIds.has(it.id) && !failedItems.has(it.id));
  const musts = supported.filter((it) => it.priority === "must");
  const mustCovRaw = musts.length === 0 ? 1
    : covered.filter((it) => it.priority === "must").length / musts.length;
  const totalW = supported.reduce((n, it) => n + w[it.priority], 0);
  const covW = covered.reduce((n, it) => n + w[it.priority], 0);
  const weightedRaw = totalW === 0 ? 1 : covW / totalW;
  const missing = supported.filter((it) => !covered.includes(it))
    .sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1));
  const feedbackKo = [
    ...failures.map((f) => {
      const label = byId.get(f.item_id);
      return `문장 ${f.sentence_id} (${f.item_id}${label ? ` ${label.label_ko}` : ""}): ${f.reason_ko}`;
    }),
    ...missing.map((it) => `[${it.priority.toUpperCase()}] ${it.id} ${it.label_ko} 항목이 빠졌어요.`),
    ...unsupported
      .filter((u) => byId.get(u.item_id).priority === "must")
      .map((u) => `[MUST] ${u.item_id} ${byId.get(u.item_id).label_ko}: ${u.reason_ko}`),
  ];
  return {
    pass: failures.length === 0 && mustCovRaw >= acceptance.must_coverage
      && weightedRaw >= acceptance.weighted_coverage_threshold,
    must_coverage: roundCoverage(mustCovRaw),
    weighted_coverage: roundCoverage(weightedRaw),
    unsupported,
    inapplicable: inapplicableList,
    failures,
    feedback_ko: feedbackKo,
  };
}

export function attemptSummary(result) {
  if (result.status === "미지원") return `검증 미지원: ${result.reason_ko}`;
  const pct = Math.round(result.weighted_coverage * 100);
  if (result.pass) return `검증 통과: 커버리지 ${pct}%`;
  const counts = new Map();
  for (const f of result.failures) {
    counts.set(f.reason_ko, (counts.get(f.reason_ko) || 0) + 1);
  }
  const bits = [...counts.entries()].map(([reason, n]) => `${reason} ${n}개`);
  if (bits.length === 0) bits.push("누락 항목 있음");
  return `검증 실패: ${bits.join(", ")}, 커버리지 ${pct}%`;
}

// Loop a draft through revise() until it passes or retries run out.
// revise(report, result, attempt) returns the next report (may be async).
// Returns { result, attempts, handoff }; attempts hold
// { attempt, report, result, summary_ko } for the demo log.
export async function runVerifyLoop({ draft, revise, run, persona, groundTruth, maxRetries }) {
  if (!groundTruth) throw new Error("runVerifyLoop needs groundTruth");
  const retries = maxRetries ?? groundTruth.acceptance.max_retries ?? 3;
  const attempts = [];
  let report = draft;
  for (let attempt = 1; attempt <= 1 + retries; attempt++) {
    const result = verifyReport(report, run, persona, { groundTruth });
    attempts.push({ attempt, report, result, summary_ko: attemptSummary(result) });
    if (result.pass || result.status === "미지원") {
      return { result, attempts, handoff: null };
    }
    if (attempt > retries) {
      return {
        result,
        attempts,
        handoff: {
          ask_user: true,
          question_ko: `리포트 검증을 ${attempts.length}번 시도했지만 통과하지 못했어요. `
            + `먼저 이 항목을 확인해 주세요: ${result.feedback_ko[0] ?? "누락된 항목"}`,
        },
      };
    }
    report = await revise(report, result, attempt);
  }
  return { result: attempts[attempts.length - 1].result, attempts, handoff: null };
}
