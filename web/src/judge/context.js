// Judge context: what each model call sees and returns (pure).
//
// Every call carries the simulated member's profile (role + the user's
// short free-text preferences — never personal data; the household is
// simulated), the day/time, today's trips so far, the last 3 decisions
// with their reasons (short memory), and the options with graph
// numbers. The model chooses; it never changes numbers — guards.js
// enforces that on the reply.
//
// Single-choice kinds (shop_choice, park_or_home, station_route) return
// {chosen_key, reason_ko, reason_en}; weekend_plan returns
// {plan, reason_ko, reason_en} with up to 3 category keys in order.

export const REASON_KO_MAX = 60;
export const REASON_EN_MAX = 90;
export const COMPLETION_TOKENS_EST = 60;

// Rough token estimate for planning only (never billed): ~3 chars per
// token is conservative for mixed Korean/English prompts.
export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 3));
}

export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chosen_key", "reason_ko", "reason_en"],
  properties: {
    chosen_key: { type: "string", description: "Exactly one key from the options list." },
    reason_ko: {
      type: "string",
      description: `Short Korean reason, at most ${REASON_KO_MAX} characters. At most one number, copied exactly from the options, or none; never state the home option's distance.`,
    },
    reason_en: {
      type: "string",
      description: `Short English reason, at most ${REASON_EN_MAX} characters. At most one number, copied exactly from the options, or none; never state the home option's distance.`,
    },
  },
};

export const WEEKEND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plan", "reason_ko", "reason_en"],
  properties: {
    plan: {
      type: "array",
      maxItems: 3,
      description: 'Up to 3 activity keys in visit order, e.g. ["park","supermarket"]. ["home"] (or []) means staying home.',
      items: { type: "string" },
    },
    reason_ko: {
      type: "string",
      description: `Short Korean reason, at most ${REASON_KO_MAX} characters. At most one number, copied exactly from the options, or none; never state the home option's distance.`,
    },
    reason_en: {
      type: "string",
      description: `Short English reason, at most ${REASON_EN_MAX} characters. At most one number, copied exactly from the options, or none; never state the home option's distance.`,
    },
  },
};

const KIND_INTRO = {
  shop_choice: "Pick one shop to visit.",
  park_or_home: "Decide between an evening park walk and staying home.",
  station_route: "Pick one station entrance for the commute walk.",
  weekend_plan: "Plan today's weekend activities: up to 3 in visit order.",
};

const SYSTEM = [
  "You decide for one simulated household member in a housing life simulator.",
  "The household is fictional; every place and number below is real simulation data.",
  "Rules:",
  `- Choose only keys from the options list (${REASON_KO_MAX}-char Korean reason, ${REASON_EN_MAX}-char English reason).`,
  "- In reasons, cite at most one number and copy it exactly from the options, or cite none. Never invent times, distances, prices or counts.",
  "- Never state the home option's distance or walk time.",
  "- Keep reasons about the person's routine and preferences.",
  "- Never mention price, cost, safety, danger, crime, school quality, or health topics.",
  "- Reply with a single JSON object matching the schema, nothing else.",
].join("\n");

function hhmm(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function tripLine(t) {
  return `- ${hhmm(t.depart_min)}→${hhmm(t.arrive_min)} ${t.purpose} ${t.from_label}→${t.to_label} (${t.minutes} min, ${Math.round(t.distance_m)} m)`;
}

function memoryLine(m) {
  const chosen = Array.isArray(m.chosen) ? m.chosen.join("+") : m.chosen;
  return `- day ${m.day} ${hhmm(m.minute)} ${m.kind} chose ${chosen}: ${m.reason_ko || ""}`;
}

// The home/stay option carries no minutes — stating "0분 거리" reads
// oddly and the model must never cite it (guards.js agrees: home
// numbers are not citable). Both park_or_home and weekend_plan use the
// "home" key (WEEKEND_HOME; kept literal — this module takes plain
// data with no engine imports).
function optionLine(o) {
  if (o.key === "home") return `- ${o.key}: ${o.label} — stay home`;
  if (!Number.isFinite(o.minutes)) {
    return Number.isFinite(o.distance_m)
      ? `- ${o.key}: ${o.label} — ${Math.round(o.distance_m)} m`
      : `- ${o.key}: ${o.label}`;
  }
  return `- ${o.key}: ${o.label} — ${o.minutes} min, ${Math.round(o.distance_m)} m`;
}

// All inputs are plain data (no engine imports): the CLI builds them
// from the run, the dev middleware from the browser request.
export function buildPrompt({
  member, agentLabel, date, weekday, minute, tripsToday = [], memory = [], shell,
}) {
  const weekend = shell.kind === "weekend_plan";
  const lines = [
    `Member: ${agentLabel} (${member.role || "adult"}), simulated.`,
    member.preferences ? `Preferences: ${member.preferences}` : "Preferences: (none given)",
    `Day: ${date} (${weekday}), time ${hhmm(minute)}.`,
    "",
    "Today's trips so far:",
    ...(tripsToday.length > 0 ? tripsToday.map(tripLine) : ["- (none yet)"]),
    "",
    "Recent decisions:",
    ...(memory.length > 0 ? memory.slice(-3).map(memoryLine) : ["- (none yet)"]),
    "",
    `Branch: ${shell.kind} at ${hhmm(minute)}. ${KIND_INTRO[shell.kind] || "Pick one key."}`,
    "Options (key: place — walk minutes, metres):",
    ...shell.options.map(optionLine),
  ];
  if (weekend) {
    lines.push(
      "",
      'Answer {"plan": [...], "reason_ko": "...", "reason_en": "..."}: up to 3 activity keys in visit order;',
      '"home" alone (or an empty plan) means staying home all day.',
    );
  } else {
    lines.push("", 'Answer {"chosen_key": "...", "reason_ko": "...", "reason_en": "..."}.');
  }
  return {
    system: SYSTEM,
    user: lines.join("\n"),
    schema: weekend ? WEEKEND_SCHEMA : DECISION_SCHEMA,
    schemaName: weekend ? "weekend_plan" : "decision",
    weekend,
  };
}
