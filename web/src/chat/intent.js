// 30c: pure rule-mode intent reader for typed picks and runs.
//
// When candidates are on screen but the relay has no key (or is down),
// the customer is told to type "살아 봐 줘" — so rule mode must
// understand "save 1 and 2" and "live in them" without extract_profile.
// Pure (no React, no DOM); unit-tested.
import { actionConfirmation } from "../consult/guards.js";
import { displayNameFor } from "../homes.js";

// Anything carrying profile values stays on the profile flow.
const PROFILE_RE = /[$＄]|전세|월세|매매|출근|출퇴근|통근|예산|억|만원|budget|commute|work\s+at|workplace/i;

// A number the run phrase owns ("30일", "30 days") is not a map number.
const RUN_COUNT_RE = /30\s*(일|days?)/gi;

const PICK_VERB_RE = /(save|pick|add|담아|담고|골라|찜)/i;
const JOIN_RE = /\d\s*(and|&|,|·)\s*#?\d/i;

const RUN_RE = /(live\s+in\s+(both\s+homes?|them)|live\s+30\s*days?|run\s+it|compare\s+them|살아\s*봐|비교해)/i;

export function isRunRequest(text) {
  const s = String(text || "");
  return RUN_RE.test(s) && !PROFILE_RE.test(s);
}

export function readChatIntent(text, { candidateCount } = {}) {
  const s = String(text || "");
  if (PROFILE_RE.test(s)) return null;
  const n = Number(candidateCount) || 0;

  const run = RUN_RE.test(s);

  const hasPickSignal = PICK_VERB_RE.test(s) || s.includes("번")
    || /#\d/.test(s) || JOIN_RE.test(s);
  let pick = null;
  if (hasPickSignal && n > 0) {
    const forNums = s.replace(RUN_COUNT_RE, " ");
    const nums = [...forNums.matchAll(/#?(\d{1,2})/g)].map((m) => Number(m[1]));
    const unique = [...new Set(nums)];
    if (unique.length >= 1 && unique.length <= 3
      && unique.every((v) => v >= 1 && v <= n)) {
      pick = unique;
    } else if (nums.length > 0) {
      return null;
    } else {
      return run ? { type: "run" } : null;
    }
  }

  if (pick && run) return { type: "pick", numbers: pick, thenRun: true };
  if (pick) return { type: "pick", numbers: pick };
  if (run) return { type: "run" };
  return null;
}

// The run gate when fewer than 2 homes are picked — byte-identical to
// runReadiness's hint in web/src/ui/chat.jsx (single definition of the
// rule text lives here for the typed path; chat.jsx renders runReadiness).
export function ruleGateLine(pickCount) {
  return `비교할 집을 2–3곳 담아 주세요 (지금 ${pickCount}곳)`;
}

// Fallback pick confirmation when actionConfirmation has nothing to say.
export function rulePickFallback(names) {
  const list = (names || []).filter(Boolean);
  return `${list.join(", ")}을 담았어요. "살아 봐 줘"라고 하면 30일을 살아 봐요`;
}

// Pure rule-turn plan for a typed turn while candidates are on screen.
// Returns null when the profile flow should keep the turn.
export function ruleTurnPlan({ text, candidates, picks } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return null;
  const intent = readChatIntent(text, { candidateCount: list.length });
  if (!intent) return null;
  const cur = Array.isArray(picks)
    ? picks.filter((id) => list.some((c) => c && c.id === id))
    : [];
  if (intent.type === "pick") {
    const ids = intent.numbers.map((v) => list[v - 1].id);
    const message = actionConfirmation(
      [{ ui: { action: "pick", ids }, candidates: list }],
    ) || rulePickFallback(ids.map((id) => {
      const c = list.find((x) => x && x.id === id);
      return c ? displayNameFor(c) : null;
    }));
    if (intent.thenRun) {
      const runReady = ids.length >= 2;
      return { type: "pick", ids, message, thenRun: true, runReady,
        gate: runReady ? null : ruleGateLine(ids.length) };
    }
    return { type: "pick", ids, message };
  }
  if (cur.length >= 2) return { type: "run", ids: cur };
  return { type: "gate", message: ruleGateLine(cur.length) };
}
