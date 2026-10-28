// 살 만한가? tab (React, Astryx). Multi-year buy-vs-rent comparison,
// computed client-side from the money doc (reference medians + customer
// inputs) with the pure worthItComparison engine. No verdict text — the
// agent explains, the customer decides.
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { fmtWon, fmtPct, badgeFor } from "../money/format.js";
import { worthItComparison, applyOwnershipCosts, breakevenLabel,
  WORTHIT_HORIZONS, WORTHIT_DEFAULT_SCENARIOS, LENDER_NOTE } from "../money/worthit.js";

const TENURE_COLORS = { "매매": "#b25a33", "전세": "#4a7ba7", "월세": "#7ba05b", "공공임대": "#9b7bb8" };

function SrcBadge({ source }) {
  return (
    <Badge variant={source === "rtms" ? "blue" : "orange"}
      label={badgeFor(source)} />
  );
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Cumulative net-position chart: buy scenario lines + band, rental lines,
// break-even dots for the 0 % 가정 시나리오.
function NetChart({ result }) {
  const W = 340;
  const H = 150;
  const horizon = result.horizon_years;
  const buy = result.tenures["매매"];
  const scenarios = result.scenarios_pct.map(String);
  const midKey = scenarios[Math.floor(scenarios.length / 2)];
  // Year-0 anchors: rentals start at 0; buy starts at one-off costs.
  const y0 = buy ? buy.costs_applied.one_off_won : 0;
  const lines = [];
  if (buy) {
    for (const g of scenarios) {
      lines.push({ key: `buy${g}`, color: TENURE_COLORS["매매"],
        dash: g === midKey ? "" : "5 3",
        values: [y0, ...buy.yearly_by_scenario[g].map((r) => r.net_won)] });
    }
  }
  for (const name of ["전세", "월세", "공공임대"]) {
    const t = result.tenures[name];
    if (t) {
      lines.push({ key: name, color: TENURE_COLORS[name], dash: "",
        values: [0, ...t.yearly.map((r) => r.net_won)] });
    }
  }
  if (lines.length === 0) return null;
  const all = lines.flatMap((l) => l.values);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all, 1);
  const X = (y) => 10 + (y / horizon) * (W - 20);
  const Y = (v) => H - 14 - ((v - lo) / Math.max(1, hi - lo)) * (H - 24);
  const zeroY = Y(0);
  const band = buy ? buy.band.map((b, i) => ({ year: i + 1, ...b })) : [];
  const bandPts = [`${X(0).toFixed(1)},${Y(y0).toFixed(1)}`,
    ...band.map((b) => `${X(b.year).toFixed(1)},${Y(b.net_min_won).toFixed(1)}`),
    ...band.map((b) => `${X(b.year).toFixed(1)},${Y(b.net_max_won).toFixed(1)}`).reverse(),
  ].join(" ");
  const dots = [];
  if (buy && result.breakeven) {
    for (const [name, per] of Object.entries(result.breakeven)) {
      const y = per[midKey];
      if (y === null || y === undefined) continue;
      dots.push({ key: name, x: X(y),
        yPos: Y(buy.yearly_by_scenario[midKey][y - 1].net_won), label: `${name} ${y}년차` });
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="누적 순비용">
      <line x1="10" y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(61,50,39,0.4)" strokeWidth="1" />
      {buy && <polygon points={bandPts} fill="rgba(178,90,51,0.15)" />}
      {lines.map((l) => (
        <polyline key={l.key} fill="none" stroke={l.color} strokeWidth="2"
          strokeDasharray={l.dash || undefined}
          points={l.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} />
      ))}
      {dots.map((d) => (
        <g key={d.key}>
          <circle cx={d.x} cy={d.yPos} r="3.5" fill={TENURE_COLORS[d.key]} />
          <text x={d.x} y={Math.max(10, d.yPos - 6)} fontSize="9" textAnchor="middle" fill="#3d3227">{d.label}</text>
        </g>
      ))}
      <text x="10" y={H - 2} fontSize="9" fill="#3d3227">0년</text>
      <text x={W - 10} y={H - 2} fontSize="9" textAnchor="end" fill="#3d3227">{horizon}년</text>
    </svg>
  );
}

function ScheduleRows({ rows }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 5);
  return (
    <VStack gap={1}>
      {shown.map((r) => (
        <Text key={r.year} type="supporting" hasTabularNumbers>
          {`${r.year}년차: 납입 ${fmtWon(r.paid_won)} (이자 ${fmtWon(r.interest_won)} · 원금 ${fmtWon(r.principal_won)}) · 잔액 ${fmtWon(r.balance_won)}`}
        </Text>
      ))}
      {rows.length > 5 && (
        <Text type="supporting">
          <a href="#" onClick={(e) => { e.preventDefault(); setOpen(!open); }}>
            {open ? "접기" : `더 보기 (${rows.length - 5}년)`}
          </a>
        </Text>
      )}
    </VStack>
  );
}

export function WorthItTab({ state }) {
  const doc = state.money;
  const labels = doc && doc.homes ? Object.keys(doc.homes) : [];
  const [home, setHome] = useState("A");
  const [horizon, setHorizon] = useState(10);
  const [opp, setOpp] = useState("0");
  const [scen, setScen] = useState(WORTHIT_DEFAULT_SCENARIOS.join(","));
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error || labels.length === 0) {
    return (
      <Banner status="warning" title="살 만한가 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const label = labels.includes(home) ? home : labels[0];
  const h = doc.homes[label];
  const ref = h.reference;
  if (!ref) return <Text type="supporting">이 집의 실거래 기준가가 없습니다.</Text>;
  const oppRate = numOr(opp, 0);
  const scenarios = String(scen).split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  let result = null;
  let error = "";
  try {
    const costsTable = doc.assumptions9b && doc.assumptions9b["ownership-costs"];
    const pub = h.by_tenure && h.by_tenure["공공임대"];
    result = worthItComparison({
      horizon_years: horizon,
      cash_won: doc.cash_won,
      loan_rate_pct: doc.assumptions.loan_rate_pct,
      loan_years: doc.assumptions.loan_years,
      opportunity_rate_pct: oppRate,
      scenarios_pct: scenarios.length > 0 ? scenarios : [...WORTHIT_DEFAULT_SCENARIOS],
      buy: ref.trade.median > 0 ? { price_won: ref.trade.median } : null,
      jeonse: ref.jeonse.deposit.median > 0 ? { deposit_won: ref.jeonse.deposit.median } : null,
      wolse: ref.wolse.monthly.median !== null && ref.wolse.monthly.median !== undefined
        ? { deposit_won: ref.wolse.deposit.median || 0, monthly_won: ref.wolse.monthly.median } : null,
      public: pub && pub.price_inputs
        && Number.isFinite(pub.price_inputs.deposit_won) && Number.isFinite(pub.price_inputs.monthly_rent_won)
        ? { deposit_won: pub.price_inputs.deposit_won, monthly_won: pub.price_inputs.monthly_rent_won } : null,
      ownership_costs: costsTable ? applyOwnershipCosts(costsTable, "KR") : null,
      annual_income_won: (doc.household_monthly_net_won || 0) * 12,
    });
  } catch (err) {
    error = String((err && err.message) || err);
  }
  if (error || !result) {
    return <Banner status="warning" title="계산할 수 없습니다" description={error} />;
  }
  const buy = result.tenures["매매"];
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <SegmentedControl label="집" value={label} onChange={setHome} size="sm">
          {labels.map((l) => (
            <SegmentedControlItem key={l} value={l} label={`홈 ${l}`} />
          ))}
        </SegmentedControl>
        <SegmentedControl label="기간" value={String(horizon)}
          onChange={(v) => setHorizon(Number(v))} size="sm">
          {WORTHIT_HORIZONS.map((y) => (
            <SegmentedControlItem key={y} value={String(y)} label={`${y}년`} />
          ))}
        </SegmentedControl>
      </HStack>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <HStack gap={1} vAlign="center">
          <Text type="supporting">현금 가정 수익률(연 %)</Text>
          <input className="ui-weight" type="number" min="0" max="20" step="0.5"
            value={opp} onChange={(e) => setOpp(e.target.value)} aria-label="현금 가정 수익률" />
        </HStack>
        <HStack gap={1} vAlign="center">
          <Text type="supporting">집값 가정(%/년, 쉼표 구분)</Text>
          <input className="ui-weight" type="text" value={scen}
            onChange={(e) => setScen(e.target.value)} aria-label="집값 가정 시나리오" />
        </HStack>
        <SrcBadge source="scenario" />
      </HStack>
      <Text type="supporting">
        {`기준가 ${h.area_m2}㎡: `}
        {buy ? `매매 ${fmtWon(buy.price_won)}` : "매매 없음"}
        {result.tenures["전세"] ? ` · 전세 ${fmtWon(result.tenures["전세"].deposit_won)}` : ""}
        {result.tenures["월세"] ? ` · 월세 ${fmtWon(result.tenures["월세"].deposit_won)}/${fmtWon(result.tenures["월세"].monthly_won)}` : ""}
        {` (실거래 ${ref.period.from}~${ref.period.to}) · 보유 현금 ${fmtWon(doc.cash_won)}`}
      </Text>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text>누적 순비용 (지출 − 돌려받는 몫)</Text>
          {Object.entries(TENURE_COLORS).filter(([t]) => result.tenures[t]).map(([t, c]) => (
            <HStack gap={1} vAlign="center" key={t}>
              <span className="ui-swatch" style={{ background: c }} aria-hidden="true" />
              <Text type="supporting">{t}</Text>
            </HStack>
          ))}
        </HStack>
        <NetChart result={result} />
        <Text type="supporting">
          {`매매 띠·점선은 집값 가정 시나리오(${result.scenarios_pct.join(" / ")} %/년, 가정 시나리오, 전망 아님)다. 실선·점은 가운데 가정(${result.scenarios_pct[Math.floor(result.scenarios_pct.length / 2)]}%)에서 매매가 각 임차를 밑도는 해다.`}
        </Text>
      </VStack>
      <MetadataList>
        {Object.entries(result.tenures).map(([name, t]) => {
          const last = name === "매매"
            ? t.band[t.band.length - 1]
            : t.yearly[t.yearly.length - 1];
          const netText = name === "매매"
            ? Object.entries(t.yearly_by_scenario).map(([g, rows]) =>
              `${g}% ${fmtWon(rows[rows.length - 1].net_won)}`).join(" · ")
            : fmtWon(last.net_won);
          return (
            <MetadataListItem key={name} label={`${name} · ${horizon}년 합계`}>
              <VStack gap={1}>
                <Text hasTabularNumbers>{`지출 ${fmtWon(last.cash_out_won)} · 이자 ${fmtWon(t.total_interest_won)} · 묶인 돈 ${fmtWon(t.locked_won)} · 기회비용 ${fmtWon(t.opportunity_cum_won)}`}</Text>
                <Text type="supporting" hasTabularNumbers>{`순비용 ${netText}`}</Text>
              </VStack>
            </MetadataListItem>
          );
        })}
        <MetadataListItem label="손익분기 (매매가 임차를 밑도는 해)">
          <VStack gap={1}>
            {Object.entries(result.breakeven).map(([name, per]) => (
              <Text key={name} type="supporting" hasTabularNumbers>
                {`${name} 대비: ${Object.entries(per).map(([g, y]) => `${g}% ${breakevenLabel(y)}`).join(" · ")}`}
              </Text>
            ))}
            {Object.keys(result.breakeven).length === 0 && (
              <Text type="supporting">비교할 임차 형태가 없습니다.</Text>
            )}
          </VStack>
        </MetadataListItem>
        {result.dsr && (
          <MetadataListItem label="DSR (보여주기만)">
            <VStack gap={1}>
              <Text hasTabularNumbers>{`${result.dsr.ratio_pct}% (연 상환 ${fmtWon(result.dsr.annual_service_won)} ÷ 연 실수령 ${fmtWon(result.dsr.annual_income_won)})`}</Text>
              <Text type="supporting">{LENDER_NOTE}</Text>
            </VStack>
          </MetadataListItem>
        )}
        {result.rate_stress && (
          <MetadataListItem label="금리 스트레스 (월 납입)">
            <Text type="supporting" hasTabularNumbers>
              {`기본 ${fmtWon(result.rate_stress.plus_0pp.monthly_won)} · +1%p ${fmtWon(result.rate_stress.plus_1pp.monthly_won)} · +2%p ${fmtWon(result.rate_stress.plus_2pp.monthly_won)}`}
            </Text>
          </MetadataListItem>
        )}
        {buy && buy.loan_won > 0 && (
          <MetadataListItem label={`대출 상환표 (${buy.schedule.rate_pct}% · ${buy.schedule.years}년 · 원리금균등)`}>
            <VStack gap={1}>
              <Text type="supporting" hasTabularNumbers>
                {`대출 ${fmtWon(buy.loan_won)} · 월 ${fmtWon(buy.schedule.monthly_won)} · 총이자 ${fmtWon(buy.schedule.total_interest_won)}`}
              </Text>
              <ScheduleRows rows={buy.schedule.yearly} />
            </VStack>
          </MetadataListItem>
        )}
        <MetadataListItem label="30일 생활 시뮬의 월 남는 돈">
          <Text type="supporting" hasTabularNumbers>
            {(["매매", "전세", "월세", "공공임대"]).map((t) => {
              const sel = h.by_tenure && h.by_tenure[t];
              return `${t} ${sel ? fmtWon(sel.remaining_won, { monthly: true }) : "–"}`;
            }).join(" · ")}
          </Text>
        </MetadataListItem>
      </MetadataList>
      <VStack gap={1}>
        <Text type="supporting">
          {result.ownership_excluded.length > 0
            ? `모형에 없음: ${result.ownership_excluded.map((e) => `${e.label}(미포함)`).join(" · ")} — 규칙표가 오면 더한다.`
            : "보유 비용 규칙표의 항목을 모두 더했다."}
        </Text>
        {result.ownership_included.length > 0 && (
          <Text type="supporting">
            {`더한 항목: ${result.ownership_included.map((e) => `${e.label} ${fmtWon(e.value_won)}`).join(" · ")}`}
          </Text>
        )}
        <Text type="supporting">보증금은 기간 끝에 전액 돌려받는 것으로 둔다 (가정). 기회비용은 손익분기에서 뺀다.</Text>
        <Text type="supporting">이 탭은 숫자 비교만 보여준다. 살지 말지는 고객이 직접 결정한다.</Text>
      </VStack>
    </VStack>
  );
}
