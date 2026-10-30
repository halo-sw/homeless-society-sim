// 생활비 + 삶의 질 tabs (React, Astryx). Rendered inside the compare
// card in sim mode. Data comes from <scenario>-money.json (CLI) plus
// agent merges for home C — never computed from thin air here.
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { store } from "./store.js";
import { SourceBadge, GroupBadges } from "./source-badge.jsx";
import { Gloss } from "./gloss.jsx";
import { glossaryTerms } from "./glossary.js";
import { monthlyHousingLabel, BURDEN_PLAIN_LABEL, BURDEN_PLAIN_NOTE,
  REMAINING_PLAIN_LABEL, HOW_CALCULATED } from "./copy.js";
import { fmtWon, fmtPct, fmtMinutes, fmtMinutesTable, fmtCount, fmtIndex } from "../money/format.js";
import { FATIGUE_MODEL_NOTE } from "../nowcard.js";
import { congestionPeakLine } from "../engine/journey.js";
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
  return <SourceBadge source={source} />;
}

export function tenureOf(state, label, doc) {
  return (state.moneyTenure && state.moneyTenure[label])
    || (doc.default_tenure && doc.default_tenure[label]) || "전세";
}

function TenureSwitch({ label, options, value }) {
  return (
    <SegmentedControl label={`${label} 사는 방식`} value={value}
      onChange={(v) => act("setMoneyTenure", label, v)} size="sm">
      {options.map((t) => (
        <SegmentedControlItem key={t} value={t} label={t} />
      ))}
    </SegmentedControl>
  );
}

// "어떻게 계산했나요?" — the ingredients behind 매달 집에 드는 돈,
// from the tenure breakdown (same numbers, explained).
export function HowCalculated({ tenure, housing, maintenanceWon, transitWon = null }) {
  const lines = [];
  if (transitWon !== null && transitWon !== undefined) {
    lines.push(`교통비 ${fmtWon(transitWon, { monthly: true })} (출퇴근 탄 횟수 × 요금)`);
  }
  if (tenure === "전세") {
    lines.push(`전세 대출 이자 ${fmtWon(housing.monthly_won, { monthly: true })} + 관리비 ${fmtWon(maintenanceWon, { monthly: true })}`);
    lines.push(`보증금 ${fmtWon(housing.upfront_won)} 중 내 돈 ${fmtWon(housing.cash_used_won)}, 나머지 ${fmtWon(housing.loan_won)}는 빌리는 것으로 가정해요`);
  } else if (tenure === "매매") {
    lines.push(`대출 갚는 돈 ${fmtWon(housing.monthly_won, { monthly: true })} (빌린 돈 ${fmtWon(housing.loan_won)}, 이자율 ${housing.rate_pct}% ${housing.years}년, 매달 같은 금액)`);
    lines.push(`집값 ${fmtWon(housing.upfront_won)} 중 내 돈 ${fmtWon(housing.cash_used_won)}을 먼저 내는 것으로 가정해요`);
  } else {
    lines.push(`${tenure === "공공임대" ? "월 임대료" : "월세"} ${fmtWon(housing.monthly_won, { monthly: true })} + 관리비 ${fmtWon(maintenanceWon, { monthly: true })}`);
    lines.push(`보증금 ${fmtWon(housing.upfront_won)}은 가진 돈에서 내는 것으로 가정해요`);
  }
  if (housing.breakdown && housing.breakdown.note) lines.push(housing.breakdown.note);
  return (
    <Collapsible trigger={<Text type="supporting">{HOW_CALCULATED}</Text>} defaultIsOpen={false}>
      <VStack gap={1}>
        {lines.map((l, i) => (
          <Text key={i} type="supporting" hasTabularNumbers>{l}</Text>
        ))}
      </VStack>
    </Collapsible>
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="30일 동안 남은 돈">
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
        {c.burden_pct !== null && c.burden_pct !== undefined ? ` · ${BURDEN_PLAIN_LABEL} ${c.burden_pct}%` : ""}
        {c.commute_minutes !== null && c.commute_minutes !== undefined ? ` · 출퇴근 ${fmtMinutes(c.commute_minutes)} (걸어서 직접 잰 시간)` : " · 시뮬레이션은 지역 생성 후"}
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
        <Text>식구들 한 달 실수령 합계 {fmtWon(net, { monthly: true })}</Text>
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
            {!sel && <Text type="supporting">이 사는 방식으로는 실제로 거래된 값이 없어요. 상담에서 면적·사는 방식을 바꿔보세요.</Text>}
            {Array.isArray(h.missing) && h.missing.map((m, i) => (
              <Text key={i} type="supporting">{`아직 계산하지 못했어요 · ${m.reason_ko || m.field}`}</Text>
            ))}
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
                  <MetadataListItem label={monthlyHousingLabel(t)}>
                    <HStack gap={1} vAlign="center">
                      <Text hasTabularNumbers>{fmtWon(sel.housing.monthly_won, { monthly: true })}</Text>
                      <SrcBadge source={sel.housing.source} />
                    </HStack>
                  </MetadataListItem>
                  <MetadataListItem label={BURDEN_PLAIN_LABEL}>
                    <VStack gap={1}>
                      <Text hasTabularNumbers>{sel.burden_ratio === null ? "–" : fmtPct(sel.burden_ratio)}</Text>
                      <Text type="supporting">{BURDEN_PLAIN_NOTE}</Text>
                    </VStack>
                  </MetadataListItem>
                  <MetadataListItem label={REMAINING_PLAIN_LABEL}>
                    <Text hasTabularNumbers>{fmtWon(sel.remaining_won, { monthly: true })}</Text>
                  </MetadataListItem>
                  <MetadataListItem label="처음에 한 번에 드는 돈">
                    <Text type="supporting" hasTabularNumbers>
                      {`필요 ${fmtWon(sel.housing.upfront_won)} · 가진 돈 ${fmtWon(doc.cash_won)}${sel.housing.loan_won > 0 ? ` · 빌리는 돈 ${fmtWon(sel.housing.loan_won)}` : ""}`}
                    </Text>
                  </MetadataListItem>
                </MetadataList>
                <HowCalculated tenure={t} housing={sel.housing}
                  maintenanceWon={Math.abs(sel.totals_by_category.maintenance || 0)} />
                <Text type="supporting">
                  {`출퇴근 ${fmtCount(sel.counts.commute_legs, "번")} × ${fmtWon(doc.assumptions.transit_fare_won)} · 장보기 ${fmtCount(sel.counts.errand_visits, "번")} × ${fmtWon(doc.assumptions.basket_won)} · ${sel.payday_note}`}
                </Text>
                {h.reference && (
                  <Text type="supporting">
                    {`실제로 거래된 값 ${h.area_m2}㎡ (${h.match_method === "parcel+name" ? "땅+단지 이름" : "단지 이름"}으로 찾은 ${h.parcel_rows + h.name_rows}건 중): `}
                    {h.reference.trade.count > 0 ? `매매 한가운데 ${fmtWon(h.reference.trade.median)}` : "매매 없음"}
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
            <Text>30일 동안 들고 나는 돈</Text>
            {series.map((s) => (
              <HStack gap={1} vAlign="center" key={s.label}>
                <span className="ui-swatch" style={{ background: s.color }} aria-hidden="true" />
                <Text type="supporting">{s.label}</Text>
              </HStack>
            ))}
          </HStack>
          <BalanceLines series={series} />
          <Text type="supporting">한 달 들고 나는 돈의 남은 금액이에요 (보증금·집값 같은 처음에 한 번에 내는 돈은 빼고요)</Text>
        </VStack>
      )}
      <VStack gap={1}>
        <Text>
          <>어려운 말: {glossaryTerms().map((t, i) => (
            <span key={t}>{i > 0 ? " · " : ""}<Gloss term={t} /></span>
          ))} (단어에 마우스를 올리면 뜻이 보여요)</>
        </Text>
        <Text>정해 둔 값</Text>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting">{`이자율 ${doc.assumptions.loan_rate_pct}% · 갚는 기간 ${doc.assumptions.loan_years}년`}</Text>
          <Text type="supporting">{`관리비 ${fmtWon(doc.assumptions.maintenance_won_month, { monthly: true })}`}</Text>
          <SrcBadge source="scenario" />
        </HStack>
        <Text type="supporting">연봉·가진 돈·정해 둔 값은 상담에서 바꿀 수 있어요.</Text>
        <Text type="supporting">{TENURE_DISCLAIMER}</Text>
        <Text type="supporting">{TRADE_TAX_NOTE}</Text>
        <Text type="supporting">국토교통부 실거래가 공개시스템 참고용 자료라서 법적 효력이 없어요. 계약한 날짜 기준이에요.</Text>
      </VStack>
      {state.moneyCandidates.length > 0 && (
        <VStack gap={1}>
          <Text><Gloss term="공공임대">공공임대</Gloss> 후보 (상담에서 찾은 것)</Text>
          {state.moneyCandidates.slice(0, 5).map((c, i) => (
            <CandidateRow key={`${c.complex_id}-${c.unit_type}-${i}`} c={c} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}

const QOL_CATS = [["grocery", "장보기"], ["park", "공원"], ["clinic", "병원"], ["station", "역"], ["eatery", "식당·카페"]];

function QolHome({ label, doc, tenure, active }) {
  const h = doc.homes[label];
  const sel = h.by_tenure && h.by_tenure[tenure];
  const time = h.qol_time || {};
  const conv = h.qol_convenience || {};
  const fat = h.qol_fatigue || null;
  const groupSources = ["graph", "scenario",
    sel && sel.housing.source,
    fat && fat.peak_congestion_ctx && fat.peak_congestion_ctx.source].filter(Boolean);
  return (
    <VStack gap={1}>
      <Heading level={4}>{`홈 ${label} · ${h.complex_name || ""}`}</Heading>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">출처</Text>
        <GroupBadges sources={groupSources} />
      </HStack>
      <MetadataList>
        <MetadataListItem label="하루 출퇴근에 쓰는 시간">
          <Text hasTabularNumbers>{fmtMinutes(time.commute_minutes_per_day)}</Text>
        </MetadataListItem>
        <MetadataListItem label="저녁에 집에서 보내는 시간">
          <Text hasTabularNumbers>{fmtMinutes(time.evening_at_home_minutes_per_day)}</Text>
        </MetadataListItem>
        <MetadataListItem label={monthlyHousingLabel(tenure)}>
          <Text hasTabularNumbers>{sel ? fmtWon(sel.housing.monthly_won, { monthly: true }) : "–"}</Text>
        </MetadataListItem>
        <MetadataListItem label={`${BURDEN_PLAIN_LABEL} / ${REMAINING_PLAIN_LABEL}`}>
          <Text hasTabularNumbers>
            {sel && sel.burden_ratio !== null
              ? `${fmtPct(sel.burden_ratio)} / ${fmtWon(sel.remaining_won, { monthly: true })}` : "–"}
          </Text>
        </MetadataListItem>
        {fat && (
          <>
            <MetadataListItem label="회사 도착할 때 피곤한 정도">
              <Text hasTabularNumbers>{fmtIndex(fat.arrival_work_avg)}</Text>
            </MetadataListItem>
            <MetadataListItem label="퇴근해서 집에 왔을 때 피곤한 정도">
              <Text hasTabularNumbers>{fmtIndex(fat.after_home_avg)}</Text>
            </MetadataListItem>
            <MetadataListItem label="하루 평균 피곤한 정도 (쉬는 시간 포함)">
              <Text hasTabularNumbers>{fmtIndex(fat.avg_30d)}</Text>
            </MetadataListItem>
            <MetadataListItem label="만원 지하철에 탄 시간">
              <Text hasTabularNumbers>{fmtMinutes(fat.crowded_min)}</Text>
            </MetadataListItem>
            <MetadataListItem label="출근길 가장 붐비는 순간">
              {fat.peak_congestion_pct === null || fat.peak_congestion_pct === undefined ? (
                <Text type="supporting">지하철 탑승 없음</Text>
              ) : (
                <Text hasTabularNumbers>{congestionPeakLine(fat.peak_congestion_ctx)}</Text>
              )}
            </MetadataListItem>
          </>
        )}
        <MetadataListItem label="걸어서 10분 안에 갈 수 있는 곳">
          <HStack gap={1} vAlign="center" wrap="wrap">
            {QOL_CATS.map(([k, ko]) => (
              <span key={k} className={active ? "ui-qolcat" : undefined}
                onMouseEnter={() => {
                  if (!active) return;
                  try { act("setQualityHover", k); } catch { /* tour mode */ }
                }}
                onMouseLeave={() => {
                  if (!active) return;
                  try { act("setQualityHover", null); } catch { /* tour mode */ }
                }}>
                <Text type="supporting" hasTabularNumbers>{`${ko} ${conv[k] ?? 0}`}</Text>
              </span>
            ))}
          </HStack>
        </MetadataListItem>
      </MetadataList>
      {fat && <Text type="supporting">피곤한 정도 0–10, 높을수록 피곤해요. {FATIGUE_MODEL_NOTE}</Text>}
    </VStack>
  );
}

export function QualityTab({ state }) {
  const doc = state.money;
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
          tenure={tenureOf(state, label, doc)} active={state.home === label} />
      ))}
      <Text type="supporting">내가 정한 비중으로 나란히 보려면 내 기준 탭을 여세요. 종합 점수는 매기지 않아요.</Text>
    </VStack>
  );
}

export { fmtMinutesTable };
