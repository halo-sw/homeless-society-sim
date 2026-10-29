// 내 기준으로 보기 tab (React, Astryx): the customer's own priorities.
//
// Per group, every home's metrics sit side by side — no ranking, no
// "추천 집". The weights (0–5, default 모두 보통) are always labelled as
// the customer's ("고객님이 정한 비중"). The one-number weighted view
// appears only when the customer asks for it, with the formula visible;
// safety counts are shown but never summed (counts are not a risk score).
// Data comes from <scenario>-money.json (+ compare totals for leisure
// trips) — never computed from thin air here.
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { PRIORITY_GROUPS, PRIORITY_METRICS, defaultWeights, weightedView } from "../priorities.js";
import { store } from "./store.js";
import { fmtWon, fmtPct, fmtMinutes, fmtCount, fmtIndex } from "../money/format.js";
import { tenureOf } from "./money.jsx";
import { Gloss } from "./gloss.jsx";
import { GroupBadges } from "./source-badge.jsx";

function fmtMetric(unit, v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  if (unit === "minutes") return fmtMinutes(v);
  if (unit === "index") return fmtIndex(v);
  if (unit === "won_month") return fmtWon(v, { monthly: true });
  if (unit === "ratio") return fmtPct(v);
  return fmtCount(v, "");
}

// Per-home metric values from the money doc (+ compare leisure totals).
// Returns {homeLabel: {metricId: number|null}}.
export function priorityValues(moneyDoc, compareDoc, tenures) {
  const out = {};
  const leisure = {};
  if (compareDoc && Array.isArray(compareDoc.metrics)) {
    const errands = compareDoc.metrics.find((m) => m.key === "errands_done");
    const parks = compareDoc.metrics.find((m) => m.key === "park_visits");
    if (errands && parks) {
      const homeA = compareDoc.home_a && compareDoc.home_a.label;
      const homeB = compareDoc.home_b && compareDoc.home_b.label;
      if (homeA) leisure[homeA] = (errands.a || 0) + (parks.a || 0);
      if (homeB) leisure[homeB] = (errands.b || 0) + (parks.b || 0);
    }
  }
  for (const [label, h] of Object.entries((moneyDoc && moneyDoc.homes) || {})) {
    const v = {};
    const edu = h.qol_education;
    if (!edu) {
      // Agent-merged homes (C) carry money only — no invented zeros.
      v.edu_nearest_school_min = null;
      v.edu_schools_10min = null;
      v.edu_academy_10min = null;
    } else {
      const c10 = (edu.counts || {}).within_10min || {};
      const nearSchool = ((edu.nearest || {}).school || [])[0];
      v.edu_nearest_school_min = nearSchool ? nearSchool.minutes : null;
      v.edu_schools_10min = (c10.school_elementary || 0) + (c10.school_middle || 0)
        + (c10.school_high || 0) + (c10.school_unknown || 0);
      v.edu_academy_10min = c10.academy ?? null;
    }
    const time = h.qol_time || {};
    v.life_commute_min = time.commute_minutes_per_day ?? null;
    v.life_evening_min = time.evening_at_home_minutes_per_day ?? null;
    v.life_fatigue = (h.qol_fatigue || {}).avg_30d ?? null;
    v.life_trips = leisure[label] ?? null;
    const safety = h.qol_safety || {};
    v.safety_total = safety.total ?? null;
    if (Array.isArray(safety.groups)) {
      const pick = (name) => (safety.groups.find((g) => g.cat1 === name) || {}).count;
      const a = pick("강력범죄");
      const b = pick("폭력범죄");
      v.safety_violent = a !== undefined && b !== undefined ? a + b : null;
    } else {
      v.safety_violent = null;
    }
    const tenure = (tenures && tenures[label]) || "전세";
    const sel = h.by_tenure && h.by_tenure[tenure];
    v.money_housing = sel ? sel.housing.monthly_won : null;
    v.money_burden = sel ? sel.burden_ratio : null;
    v.money_remaining = sel ? sel.remaining_won : null;
    const conv = h.qol_convenience || {};
    v.conv_grocery = conv.grocery ?? null;
    v.conv_clinic = conv.clinic ?? null;
    v.conv_station = conv.station ?? null;
    out[label] = v;
  }
  return out;
}

const UNIT_KO = { minutes: "분", index: "0–100", won_month: "원/월", ratio: "%", count: "곳·건·회" };

function WeightStepper({ group, value, onChange }) {
  return (
    <HStack gap={1} vAlign="center">
      <Text type="supporting">{group.title}</Text>
      <input className="ui-weight" type="number" min="0" max="5" step="1"
        value={value}
        onChange={(e) => onChange(Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0))))}
        aria-label={`${group.title} 비중 0부터 5까지`} />
    </HStack>
  );
}

export function PrioritiesTab({ state }) {
  const doc = state.money;
  const [weights, setWeights] = useState(defaultWeights());
  const [showNumber, setShowNumber] = useState(false);
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="내 기준 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const labels = Object.keys(doc.homes || {});
  const tenures = {};
  for (const label of labels) tenures[label] = tenureOf(state, label, doc);
  const values = priorityValues(doc, state.compare, tenures);
  const weighed = showNumber ? weightedView(values, weights, { explicit: true }) : null;
  return (
    <VStack gap={2}>
      <VStack gap={1}>
        <Text>고객님이 정한 비중 (각 0–5 · 기본 모두 보통)</Text>
        <HStack gap={2} vAlign="center" wrap="wrap">
          {PRIORITY_GROUPS.map((g) => (
            <WeightStepper key={g.id} group={g} value={weights[g.id]}
              onChange={(v) => {
                const next = { ...weights, [g.id]: v };
                setWeights(next);
                // The share card's bars read this (published on change
                // only — untouched stays null, "비중을 정하지 않았어요").
                store.set({ priorityWeights: { explicit: true, weights: next } });
              }} />
          ))}
        </HStack>
        <Text type="supporting">0 = 안 봄 · 5 = 가장 중요. 이 비중이 집을 비교하는 유일한 가중치입니다.</Text>
      </VStack>
      {PRIORITY_GROUPS.map((g) => {
        const metrics = PRIORITY_METRICS.filter((m) => m.group === g.id);
        return (
        <VStack gap={1} key={g.id}>
          <Heading level={4}>{g.title}</Heading>
          <Text type="supporting">{g.note}</Text>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">출처</Text>
            <GroupBadges sources={metrics.map((m) => m.source)} />
          </HStack>
          <MetadataList>
            {metrics.map((m) => (
              <MetadataListItem key={m.id} label={`${m.label} (${UNIT_KO[m.unit] || m.unit})`}>
                <Text hasTabularNumbers>
                  {labels.map((l) => `${l} ${fmtMetric(m.unit, (values[l] || {})[m.id])}`).join(" · ")}
                </Text>
                {m.note && <Text type="supporting">{m.note}</Text>}
              </MetadataListItem>
            ))}
          </MetadataList>
          {g.id === "safety" && (
            <Text type="supporting">관할 단위가 다른 지역(구 vs 시)의 건수는 직접 비교할 수 없습니다. 기록된 곳 기준 발생 건수이며 거주자의 위험도가 아닙니다.</Text>
          )}
          {g.id === "money" && (
            <Text type="supporting">
              {labels.map((l) => `${l} ${tenures[l]}`).join(" · ")} 기준이에요. <Gloss term="주거비 부담률" />은 생활비 탭에서 고른 사는 방식을 따라가요.
            </Text>
          )}
        </VStack>
        );
      })}
      <VStack gap={1}>
        {!showNumber && (
          <HStack gap={1}>
            <Button size="sm" variant="secondary" label="한 숫자로 보기"
              onClick={() => setShowNumber(true)} />
          </HStack>
        )}
        {showNumber && weighed && !weighed.ok && (
          <Banner status="warning" title="한 숫자를 내지 못했어요" description={weighed.error} />
        )}
        {showNumber && weighed && weighed.ok && (
          <>
            <MetadataList>
              {labels.map((l) => (
                <MetadataListItem key={l} label={`홈 ${l} 한 숫자 참고값`}>
                  <Text hasTabularNumbers>
                    {weighed.homes[l].score === null ? "–" : weighed.homes[l].score.toFixed(2)}
                  </Text>
                </MetadataListItem>
              ))}
            </MetadataList>
            <Text type="supporting">{weighed.formula}</Text>
            <Text type="supporting">{weighed.note}</Text>
          </>
        )}
      </VStack>
    </VStack>
  );
}
