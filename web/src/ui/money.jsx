// 생활비 + 삶의 질 tabs (React, Astryx). Rendered inside the compare
// card in sim mode. Data comes from <scenario>-money.json (CLI) plus
// agent merges for home C — never computed from thin air here.
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { store } from "./store.js";
import { fmtWon, fmtPct, fmtMinutes, fmtMinutesTable, fmtCount, badgeFor } from "../money/format.js";
import { MONEY_CATEGORY_KO } from "../money/timeline.js";
import { TENURE_DISCLAIMER, TRADE_TAX_NOTE } from "../money/tenure.js";
import { ELIGIBILITY_NOTE } from "../money/housing.js";

const act = (name, ...args) => store.act(name, ...args);

const CAT_COLORS = {
  housing: "#b25a33",
  transit: "#4a7ba7",
  grocery: "#7ba05b",
  maintenance: "#d9a878",
  other_fixed: "#9fc4d8",
};
const HOME_COLORS = { A: "#b25a33", B: "#4a7ba7", C: "#7ba05b" };
const TENURES = ["매매", "전세", "월세", "공공임대"];

function SrcBadge({ source }) {
  return (
    <Badge variant={source === "graph" ? "teal" : source === "rtms" ? "blue" : source === "housing_api" ? "purple" : "orange"}
      label={badgeFor(source)} />
  );
}

function tenureOf(state, label, doc) {
  return (state.moneyTenure && state.moneyTenure[label])
    || (doc.default_tenure && doc.default_tenure[label]) || "전세";
}

function TenureSwitch({ label, options, value }) {
  return (
    <SegmentedControl label={`${label} 점유 형태`} value={value}
      onChange={(v) => act("setMoneyTenure", label, v)} size="sm">
      {options.map((t) => (
        <SegmentedControlItem key={t} value={t} label={t} />
      ))}
    </SegmentedControl>
  );
}

// One home's monthly spending as a stacked bar against the net (track).
function SpendBar({ totals, net }) {
  const cats = ["housing", "transit", "grocery", "maintenance", "other_fixed"];
  const spent = cats.reduce((a, c) => a + Math.abs(totals[c] || 0), 0);
  const scale = Math.max(net, spent, 1);
  return (
    <svg viewBox="0 0 200 14" width="100%" height="14" role="img" aria-label="월 지출">
      <rect x="0" y="2" width="200" height="10" rx="3" fill="rgba(61,50,39,0.12)" />
      {(() => {
        let x = 0;
        return cats.map((c) => {
          const w = (Math.abs(totals[c] || 0) / scale) * 200;
          const el = w > 0.5 ? <rect key={c} x={x} y={2} width={w} height={10} fill={CAT_COLORS[c]} /> : null;
          x += w;
          return el;
        });
      })()}
    </svg>
  );
}

function BalanceLines({ series }) {
  // series: [{label, color, values:[31]}]
  const W = 320;
  const H = 96;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all, 1);
  const X = (i, n) => 8 + (i / Math.max(1, n - 1)) * (W - 16);
  const Y = (v) => H - 10 - ((v - lo) / Math.max(1, hi - lo)) * (H - 20);
  const zeroY = Y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="30일 잔액">
      <line x1="8" y1={zeroY} x2={W - 8} y2={zeroY} stroke="rgba(61,50,39,0.4)" strokeWidth="1" />
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2"
          points={s.values.map((v, i) => `${X(i, s.values.length).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} />
      ))}
    </svg>
  );
}

function CandidateRow({ c }) {
  const label = `${c.address || c.complex_name || ""} ${c.exclusive_area_m2}㎡`;
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>{label}</Text>
        <SrcBadge source="housing_api" />
      </HStack>
      <Text type="supporting">
        {`보증금 ${fmtWon(c.deposit_won)} · 월 ${fmtWon(c.monthly_rent_won)}`}
        {c.burden_pct !== null && c.burden_pct !== undefined ? ` · 부담률 ${c.burden_pct}%` : ""}
        {c.commute_minutes !== null && c.commute_minutes !== undefined ? ` · 통근 ${fmtMinutes(c.commute_minutes)} (그래프)` : " · 시뮬레이션은 지역 생성 후"}
      </Text>
      {(c.notices || []).slice(0, 2).map((n) => (
        <Text key={n.id} type="supporting">
          <a href={n.source_url} target="_blank" rel="noreferrer">{n.title || "공고 원문"}</a>
        </Text>
      ))}
      <Text type="supporting">{ELIGIBILITY_NOTE}</Text>
      <HStack gap={1}>
        <Button size="sm" variant="secondary" label="C로 추가"
          onClick={() => {
            try {
              act("consultSend", `공공임대 후보 ${c.complex_id} ${c.unit_type}형을 C로 추가해줘`);
            } catch {
              store.set({ consultOpen: true });
            }
          }} />
      </HStack>
    </VStack>
  );
}

export function MoneyTab({ state }) {
  const doc = state.money;
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="생활비 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const labels = Object.keys(doc.homes || {});
  const net = doc.household_monthly_net_won || 0;
  const series = [];
  for (const label of labels) {
    const t = tenureOf(state, label, doc);
    const sel = doc.homes[label].by_tenure && doc.homes[label].by_tenure[t];
    if (sel) series.push({ label, color: HOME_COLORS[label] || "#3d3227", values: sel.daily_balance_won });
  }
  return (
    <VStack gap={2}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>가구 실수령 합계 {fmtWon(net, { monthly: true })}</Text>
        <SrcBadge source={doc.payroll ? "payroll_estimate" : "user_input"} />
      </HStack>
      {labels.map((label) => {
        const h = doc.homes[label];
        const options = TENURES.filter((t) => h.by_tenure && h.by_tenure[t]);
        const t = tenureOf(state, label, doc);
        const sel = h.by_tenure[t];
        return (
          <VStack gap={1} key={label}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={4}>{`홈 ${label} · ${h.complex_name || ""}`}</Heading>
              {options.length > 0 && <TenureSwitch label={label} options={options} value={t} />}
            </HStack>
            {!sel && <Text type="supporting">이 점유 형태의 기준가가 없습니다. 상담에서 면적·형태를 바꿔보세요.</Text>}
            {sel && (
              <>
                <SpendBar totals={sel.totals_by_category} net={net} />
                <HStack gap={1} vAlign="center" wrap="wrap">
                  {Object.entries(MONEY_CATEGORY_KO).filter(([k]) => k !== "salary").map(([k, ko]) => (
                    <HStack gap={1} vAlign="center" key={k}>
                      <span className="ui-swatch" style={{ background: CAT_COLORS[k] }} aria-hidden="true" />
                      <Text type="supporting">{`${ko} ${fmtWon(Math.abs(sel.totals_by_category[k] || 0))}`}</Text>
                    </HStack>
                  ))}
                </HStack>
                <MetadataList>
                  <MetadataListItem label="월 주거비">
                    <HStack gap={1} vAlign="center">
                      <Text hasTabularNumbers>{fmtWon(sel.housing.monthly_won, { monthly: true })}</Text>
                      <SrcBadge source={sel.housing.source} />
                    </HStack>
                  </MetadataListItem>
                  <MetadataListItem label="주거비 부담률">
                    <Text hasTabularNumbers>{sel.burden_ratio === null ? "–" : fmtPct(sel.burden_ratio)}</Text>
                  </MetadataListItem>
                  <MetadataListItem label="남는 돈">
                    <Text hasTabularNumbers>{fmtWon(sel.remaining_won, { monthly: true })}</Text>
                  </MetadataListItem>
                  <MetadataListItem label="목돈">
                    <Text type="supporting" hasTabularNumbers>
                      {`필요 ${fmtWon(sel.housing.upfront_won)} · 보유 ${fmtWon(doc.cash_won)}${sel.housing.loan_won > 0 ? ` · 대출 ${fmtWon(sel.housing.loan_won)}` : ""}`}
                    </Text>
                  </MetadataListItem>
                </MetadataList>
                <Text type="supporting">
                  {`통근 ${fmtCount(sel.counts.commute_legs, "회")} × ${fmtWon(doc.assumptions.transit_fare_won)} · 장보기 ${fmtCount(sel.counts.errand_visits, "회")} × ${fmtWon(doc.assumptions.basket_won)} · ${sel.payday_note}`}
                </Text>
                {h.reference && (
                  <Text type="supporting">
                    {`기준가 ${h.area_m2}㎡ (${h.match_method === "parcel+name" ? "필지+단지명" : "단지명"} ${h.parcel_rows + h.name_rows}건 중): `}
                    {h.reference.trade.count > 0 ? `매매 중간 ${fmtWon(h.reference.trade.median)}` : "매매 없음"}
                    {h.reference.jeonse.count > 0 ? ` · 전세 ${fmtWon(h.reference.jeonse.deposit.median)}` : ""}
                    {h.reference.wolse.count > 0 ? ` · 월세 ${fmtWon(h.reference.wolse.deposit.median)}/${fmtWon(h.reference.wolse.monthly.median)}` : ""}
                  </Text>
                )}
              </>
            )}
          </VStack>
        );
      })}
      {series.length > 0 && (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <Text>30일 잔액</Text>
            {series.map((s) => (
              <HStack gap={1} vAlign="center" key={s.label}>
                <span className="ui-swatch" style={{ background: s.color }} aria-hidden="true" />
                <Text type="supporting">{s.label}</Text>
              </HStack>
            ))}
          </HStack>
          <BalanceLines series={series} />
          <Text type="supporting">월 현금흐름 잔액 (보증금·매매 대금 등 목돈 제외)</Text>
        </VStack>
      )}
      <VStack gap={1}>
        <Text>가정값</Text>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting">{`금리 ${doc.assumptions.loan_rate_pct}% · ${doc.assumptions.loan_years}년`}</Text>
          <Text type="supporting">{`관리비 ${fmtWon(doc.assumptions.maintenance_won_month, { monthly: true })}`}</Text>
          <SrcBadge source="scenario" />
        </HStack>
        <Text type="supporting">연봉·현금·가정값은 상담에서 바꿀 수 있습니다.</Text>
        <Text type="supporting">{TENURE_DISCLAIMER}</Text>
        <Text type="supporting">{TRADE_TAX_NOTE}</Text>
        <Text type="supporting">국토교통부 실거래가 공개시스템 참고용 자료로 법적 효력이 없으며 계약일 기준입니다.</Text>
      </VStack>
      {state.moneyCandidates.length > 0 && (
        <VStack gap={1}>
          <Text>공공임대 후보 (상담 결과)</Text>
          {state.moneyCandidates.slice(0, 5).map((c, i) => (
            <CandidateRow key={`${c.complex_id}-${c.unit_type}-${i}`} c={c} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}

function QolHome({ label, doc, tenure }) {
  const h = doc.homes[label];
  const sel = h.by_tenure && h.by_tenure[tenure];
  const time = h.qol_time || {};
  const conv = h.qol_convenience || {};
  return (
    <VStack gap={1}>
      <Heading level={4}>{`홈 ${label} · ${h.complex_name || ""}`}</Heading>
      <MetadataList>
        <MetadataListItem label="시간 · 하루 통근">
          <HStack gap={1} vAlign="center">
            <Text hasTabularNumbers>{fmtMinutes(time.commute_minutes_per_day)}</Text>
            <SrcBadge source="graph" />
          </HStack>
        </MetadataListItem>
        <MetadataListItem label="시간 · 저녁 재택">
          <HStack gap={1} vAlign="center">
            <Text hasTabularNumbers>{fmtMinutes(time.evening_at_home_minutes_per_day)}</Text>
            <SrcBadge source="scenario" />
          </HStack>
        </MetadataListItem>
        <MetadataListItem label="돈 · 월 주거비">
          <HStack gap={1} vAlign="center">
            <Text hasTabularNumbers>{sel ? fmtWon(sel.housing.monthly_won, { monthly: true }) : "–"}</Text>
            {sel && <SrcBadge source={sel.housing.source} />}
          </HStack>
        </MetadataListItem>
        <MetadataListItem label="돈 · 부담률 / 남는 돈">
          <Text hasTabularNumbers>
            {sel && sel.burden_ratio !== null
              ? `${fmtPct(sel.burden_ratio)} / ${fmtWon(sel.remaining_won, { monthly: true })}` : "–"}
          </Text>
        </MetadataListItem>
        <MetadataListItem label="편의 · 10분 도보">
          <HStack gap={1} vAlign="center">
            <Text type="supporting" hasTabularNumbers>
              {`장보기 ${conv.grocery ?? 0} · 공원 ${conv.park ?? 0} · 병원 ${conv.clinic ?? 0} · 역 ${conv.station ?? 0} · 식당·카페 ${conv.eatery ?? 0}`}
            </Text>
            <SrcBadge source="graph" />
          </HStack>
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}

export function QualityTab({ state }) {
  const doc = state.money;
  const [weights, setWeights] = useState({ time: 40, money: 40, convenience: 20 });
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="삶의 질 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const labels = Object.keys(doc.homes || {});
  return (
    <VStack gap={2}>
      {labels.map((label) => (
        <QolHome key={label} label={label} doc={doc}
          tenure={tenureOf(state, label, doc)} />
      ))}
      <VStack gap={1}>
        <Text>내 기준 가중치 (고객 입력, 종합 점수는 매기지 않습니다)</Text>
        <HStack gap={2} vAlign="center" wrap="wrap">
          {[["time", "시간"], ["money", "돈"], ["convenience", "편의"]].map(([k, ko]) => (
            <HStack gap={1} vAlign="center" key={k}>
              <Text type="supporting">{ko}</Text>
              <input className="ui-weight" type="number" min="0" max="100" step="5"
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                aria-label={`내 기준 ${ko} 가중치`} />
            </HStack>
          ))}
        </HStack>
        <Text type="supporting">{`시간 ${weights.time} · 돈 ${weights.money} · 편의 ${weights.convenience} — 고객님이 직접 정한 비중입니다.`}</Text>
      </VStack>
    </VStack>
  );
}

export { fmtMinutesTable };
