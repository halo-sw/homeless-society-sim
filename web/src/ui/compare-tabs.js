// Compare-card tabs (pure, no React): two-level structure so every tab
// label stays fully readable in the 400 px card at 1440 and 1100 wide.
//
// Groups: 비교 (A·B 비교 / 내 기준 / 삶의 질 / 기준) · 돈 (생활비 /
// 살 만한가?) · 안심 (치안·교육 / 전세 점검 / 지원 제도) · 매물 (내가 본
// 매물 / 공공 공고). `listings-public` renders the same 매물 tab
// scrolled to the public notices; every old `?tab=` id resolves to
// itself, so deep links keep working.

export const COMPARE_TABS = [
  { value: "compare", label: "A·B 비교" },
  { value: "priorities", label: "내 기준" },
  { value: "money", label: "생활비" },
  { value: "worthit", label: "살 만한가?" },
  { value: "quality", label: "삶의 질" },
  { value: "safety", label: "치안·교육" },
  { value: "jeonse", label: "전세 점검" },
  { value: "support", label: "지원 제도" },
  { value: "listings", label: "내가 본 매물" },
  { value: "listings-public", label: "공공 공고" },
  { value: "criteria", label: "기준" },
];

export const COMPARE_GROUPS = [
  { id: "compare", label: "비교", tabs: ["compare", "priorities", "quality", "criteria"] },
  { id: "money", label: "돈", tabs: ["money", "worthit"] },
  { id: "safety", label: "안심", tabs: ["safety", "jeonse", "support"] },
  { id: "listings", label: "매물", tabs: ["listings", "listings-public"] },
];

export const VALID_COMPARE_TABS = COMPARE_TABS.map((t) => t.value);

// Legacy `?tab=` aliases (old id → current id). Empty today: no tab id
// has ever been renamed, and the mapping test pins that every shipped
// id resolves.
export const LEGACY_TAB_ALIASES = {};

export function labelForTab(value) {
  const found = COMPARE_TABS.find((t) => t.value === value);
  return found ? found.label : String(value || "");
}

export function groupForTab(value) {
  const found = COMPARE_GROUPS.find((g) => g.tabs.includes(value));
  return found ? found.id : COMPARE_GROUPS[0].id;
}

export function tabsInGroup(groupId) {
  const found = COMPARE_GROUPS.find((g) => g.id === groupId);
  return (found || COMPARE_GROUPS[0]).tabs.slice();
}

export function resolveTabId(id) {
  const key = String(id || "");
  if (LEGACY_TAB_ALIASES[key]) return LEGACY_TAB_ALIASES[key];
  return VALID_COMPARE_TABS.includes(key) ? key : "";
}

// 26e: USD runs hide the Korean-only tabs (전세 점검 · 지원 제도 ·
// 치안·교육 · 공공 공고). Any other currency returns the input unchanged.
const US_HIDDEN_TABS = new Set(["jeonse", "support", "safety", "listings-public"]);

export function tabsForCurrency(tabs, currency) {
  if (currency !== "USD") return tabs;
  return (tabs || []).filter((t) => !US_HIDDEN_TABS.has(t));
}
