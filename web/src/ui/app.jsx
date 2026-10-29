// Page overlays on Astryx (React). The scene owns the 3D canvas and
// publishes state to the store; this module only renders it and routes
// UI actions back through store.act(). No three.js here.
import { useSyncExternalStore } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { store } from "./store.js";
import { TopBar, MapTools } from "./topbar.jsx";
import { SourceBadge, GroupBadges } from "./source-badge.jsx";
import { COMPARE_GROUPS, groupForTab, labelForTab, tabsInGroup } from "./compare-tabs.js";
import { Landing } from "./landing.jsx";
// Cycle with chat.jsx (it reuses CompareCard): render-time use only,
// so module evaluation order is safe.
import { ChatScreen, AgentTourCard } from "./chat.jsx";
import { TimelineBar } from "./timeline.jsx";
import { CriteriaTab } from "./criteria.jsx";
import { MoneyTab, QualityTab } from "./money.jsx";
import { PrioritiesTab } from "./priorities.jsx";
import { SafetyEduTab } from "./safety-edu.jsx";
import { WorthItTab } from "./worthit.jsx";
import { JeonseTab } from "./jeonse.jsx";
import { SupportTab } from "./support.jsx";
import { ListingsTab } from "./listings.jsx";
import { ShareDialog } from "./share.jsx";
import { DemoTour } from "./DemoTour.jsx";
import { fmtMinutes, fmtDistance, fmtCount, fmtIndex, fmtPercent } from "../money/format.js";
import { BAND_LABEL, BAND_ORDER } from "../journey.js";
import { congestionBand, congestionPeakLine } from "../engine/journey.js";
import { criterionTitle } from "../engine/criteria.js";
import { FATIGUE_MODEL_NOTE, chipDisplay, tickerDisplay } from "../nowcard.js";

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

const act = (name, ...args) => store.act(name, ...args);

function SegControl({ label, value, onChange, items, size }) {
  return (
    <SegmentedControl label={label} value={value} onChange={onChange} size={size || "sm"}>
      {items.map((it) => (
        <SegmentedControlItem key={it.value} value={it.value} label={it.label} />
      ))}
    </SegmentedControl>
  );
}

// 12b: the sim bar is the TimelineBar (timeline.jsx) — route steps,
// the day strip (+ A·B stack), the activity legend and the 30-day
// strip. The two sliders and the tick dots are gone.

function CaptionCard({ state }) {
  const c = state.caption;
  if (!c) return null;
  const j = state.judge;
  return (
    <div className="ui-caption overlay">
      <Card>
        <VStack gap={2}>
          <VStack gap={0}>
            <Heading level={4}>{c.name}</Heading>
            {c.meta && <Text type="supporting">{c.meta}</Text>}
          </VStack>
          {c.walk && <Text>{c.walk}</Text>}
          {c.dots && c.dots.count > 0 && (
            <div className="ui-dots" aria-hidden="true">
              <Text type="supporting">
                {Array.from({ length: c.dots.count }, (_, i) => (i === c.dots.active ? "●" : "○")).join(" ")}
              </Text>
            </div>
          )}
          {j && (
            <VStack gap={1}>
              <HStack gap={1} vAlign="center" wrap="wrap">
                <Text type="supporting">{j.badgeText}</Text>
                {j.canAsk && (
                  <Button size="sm" variant="ghost" label="Muse에게 묻기"
                    isLoading={state.judgeAskState === "asking"}
                    onClick={() => act("askLive")} />
                )}
              </HStack>
              <Text type="supporting">{j.text}</Text>
            </VStack>
          )}
          {state.askError && (
            <Banner status="warning" title="라이브 판단을 불러오지 못했습니다"
              description={state.askError} isDismissable
              onDismiss={() => store.set({ askError: "" })} />
          )}
        </VStack>
      </Card>
    </div>
  );
}

function JudgeLogCard({ state }) {
  if (state.judgeLog.length === 0) return null;
  return (
    <div className="ui-judgelog overlay">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>선택 기록</Heading>
            <span className="ui-panel-spacer" />
            {state.judge && state.judge.canAsk && (
              <Button size="sm" variant="ghost" label="Muse에게 묻기"
                isLoading={state.judgeAskState === "asking"}
                onClick={() => act("askLive")} />
            )}
          </HStack>
          {state.askError && (
            <Banner status="warning" title="라이브 판단을 불러오지 못했습니다"
              description={state.askError} isDismissable
              onDismiss={() => store.set({ askError: "" })} />
          )}
          <ol className="ui-timeline">
            {state.judgeLog.map((row, i) => (
              <li key={row.id || i}
                className={state.judgeFlash === row.id ? "ui-timeline-row ui-flash" : "ui-timeline-row"}>
                <span className="ui-timeline-dot" aria-hidden="true" />
                <VStack gap={0}>
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    <Text type="supporting" hasTabularNumbers>{row.minute}</Text>
                    <Text type="supporting">{`${row.agent} · ${row.kind} → ${row.choice}`}</Text>
                    <Text type="supporting">{row.badgeText}</Text>
                    {state.judgeFlash === row.id && <Text type="supporting">지금</Text>}
                  </HStack>
                  {row.reason && <Text type="supporting">“{row.reason}”</Text>}
                </VStack>
              </li>
            ))}
          </ol>
        </VStack>
      </Card>
    </div>
  );
}

const WHY_KIND_KO = { routine: "평소 습관", decision: "고른 것", input: "고객님이 정한 것", none: "기록 없음" };

const BAND_CSS = { calm: "#4a9b6b", normal: "#d9a83c", crowded: "#d96c3c", packed: "#c0392b" };

// Fatigue line over the day: stepwise value 0–100 with event markers.
function FatigueSpark({ series, nowMin }) {
  const pts = (series || []).filter((p) => Number.isFinite(p.m) && Number.isFinite(p.v));
  if (pts.length === 0) return null;
  const W = 288;
  const H = 44;
  const X = (m) => Math.max(0, Math.min(W, (m / 1440) * W));
  const Y = (v) => H - 4 - (Math.max(0, Math.min(100, v)) / 100) * (H - 8);
  let d = `M ${X(pts[0].m)} ${Y(pts[0].v)}`;
  for (const p of pts.slice(1)) d += ` L ${X(p.m)} ${Y(p.v)}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="하루 피곤한 정도">
      {[0, 50, 100].map((v) => (
        <line key={v} x1={0} y1={Y(v)} x2={W} y2={Y(v)} stroke="#e5e0d5" strokeWidth={1} />
      ))}
      <path d={d} fill="none" stroke="#8a6d3b" strokeWidth={1.6} />
      {pts.filter((p) => p.label).map((p, i) => (
        <circle key={i} cx={X(p.m)} cy={Y(p.v)} r={2.4} fill="#8a6d3b">
          <title>{`${p.label} (${p.v})`}</title>
        </circle>
      ))}
      {Number.isFinite(nowMin) && (
        <line x1={X(nowMin)} y1={0} x2={X(nowMin)} y2={H} stroke="#666" strokeWidth={1} strokeDasharray="2 2" />
      )}
    </svg>
  );
}

// At most 3 criterion chips; the rest hide behind "+N개 기준" (stage 9c).
function CriterionChips({ ids }) {
  const [open, setOpen] = useState(false);
  const { visible, hiddenCount } = chipDisplay(ids, open);
  if (visible.length === 0) return null;
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      {visible.map((id) => (
        // 13e4: the Korean rule title on the chip; the internal id
        // stays in `title` only.
        <span key={id} title={id}>
          <Button size="sm" variant="ghost" label={criterionTitle(id)}
            onClick={() => act("openCriterion", id)} />
        </span>
      ))}
      {hiddenCount > 0 && (
        <Button size="sm" variant="ghost" label={open ? "접기" : `+${hiddenCount}개 기준`}
          onClick={() => setOpen(!open)} />
      )}
    </HStack>
  );
}

// Last 3 ticker rows; the rest hide behind an expander (stage 9c).
function TickerList({ events }) {
  const [open, setOpen] = useState(false);
  const { visible, hiddenCount } = tickerDisplay(events, open);
  if (visible.length === 0) return null;
  return (
    <VStack gap={0}>
      {visible.map((e, i) => (
        <Text key={i} type="supporting" hasTabularNumbers>{e.text}</Text>
      ))}
      {hiddenCount > 0 && (
        <Button size="sm" variant="ghost" label={open ? "접기" : `이전 기록 ${hiddenCount}개 더 보기`}
          onClick={() => setOpen(!open)} />
      )}
    </VStack>
  );
}

function FatigueBar({ fatigue, nowMin }) {
  const f = fatigue;
  const width = `${Math.max(0, Math.min(100, f.value))}%`;
  const deltaText = f.delta === null || f.delta === undefined
    ? "" : ` (${f.delta > 0 ? "+" : ""}${Math.round(f.delta * 10) / 10})`;
  const peakLine = f.peakCongestion ? congestionPeakLine(f.peakCongestion) : null;
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>{`지금 피곤한 정도 ${fmtIndex(f.value)}${deltaText}`}</Text>
        {f.source && <SourceBadge source={f.source} />}
      </HStack>
      <div className="ui-progress" role="progressbar" aria-label="피곤한 정도 (0–100)"
        aria-valuenow={Math.round(f.value)} aria-valuemin={0} aria-valuemax={100}>
        <div className="ui-progress-fill" style={{ width }} />
      </div>
      {f.note && <Text type="supporting">{f.note}</Text>}
      {peakLine && (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting" hasTabularNumbers>{`오늘 가장 붐비는 순간 · ${peakLine}`}</Text>
          <SourceBadge source={f.peakCongestion.source} />
        </HStack>
      )}
      <FatigueSpark series={f.series} nowMin={nowMin} />
      <Text type="supporting">{FATIGUE_MODEL_NOTE}</Text>
      <CriterionChips ids={f.criterionIds} />
    </VStack>
  );
}

function JourneyCard({ state }) {
  const journey = state.journey;
  const loading = state.journeyLoading;
  if (!journey && !loading) return null;
  const legs = journey ? journey.legs || [] : [];
  return (
    <div className="ui-journey">
      <Card>
        <VStack gap={1}>
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Heading level={4}>이동 중</Heading>
            <GroupBadges sources={legs.map((l) => l.source)} />
            <HStack gap={1} vAlign="center">
              {[["auto", "자동"], ["low", "거리 보기"], ["high", "전체 경로"]].map(([v, label]) => (
                <Button key={v} size="sm" variant={state.journeyView === v ? "secondary" : "ghost"}
                  label={label} onClick={() => act("setJourneyView", v)} />
              ))}
            </HStack>
          </HStack>
          {loading && <Text type="supporting">{loading}</Text>}
          {journey && (
            <>
              <HStack gap={1} vAlign="center">
                <Text>{journey.where}</Text>
                {journey.totalMin > 0 && (
                  <Text type="supporting" hasTabularNumbers>{`남은 ${journey.minutesLeft}분`}</Text>
                )}
              </HStack>
              {journey.totalMin > 0 && (
                <div className="ui-progress" role="progressbar" aria-label="이동 진행률"
                  aria-valuenow={journey.elapsedMin} aria-valuemin={0} aria-valuemax={journey.totalMin}>
                  <div className="ui-progress-fill"
                    style={{ width: `${Math.min(100, (journey.elapsedMin / journey.totalMin) * 100)}%` }} />
                </div>
              )}
              <VStack gap={0}>
                {legs.map((l, i) => {
                  const band = congestionBand(l.valuePct).key;
                  return (
                    <HStack key={i} gap={1} vAlign="center" wrap="wrap">
                      <span style={{ width: 8, height: 8, borderRadius: 4,
                        background: BAND_CSS[band], display: "inline-block" }} />
                      <Text type="supporting" hasTabularNumbers>
                        {`${l.line} ${l.from}→${l.to} ${fmtMinutes(l.minutes)} · 붐비는 정도 ${l.valuePct}%`}
                      </Text>
                    </HStack>
                  );
                })}
              </VStack>
              <HStack gap={1} vAlign="center" wrap="wrap">
                {BAND_ORDER.map((b) => (
                  <HStack key={b} gap={1} vAlign="center">
                    <span style={{ width: 8, height: 8, borderRadius: 4,
                      background: BAND_CSS[b], display: "inline-block" }} />
                    <Text type="supporting">{BAND_LABEL[b]}</Text>
                  </HStack>
                ))}
              </HStack>
              <Text type="supporting">{journey.corridorLabel}</Text>
              {journey.detailNote && <Text type="supporting">{journey.detailNote}</Text>}
              <Text type="supporting">{`붐비는 정도 자료: ${journey.congestionSource}`}</Text>
            </>
          )}
        </VStack>
      </Card>
    </div>
  );
}

function NowCard({ state }) {
  const n = state.now;
  if (!n) return null;
  if (n.free) {
    return (
      <div className="ui-nowcard">
        <Card>
          <VStack gap={1}>
            <Heading level={4}>지금 식구들 모습</Heading>
            {n.rows.map((r) => (
              <Text key={r.agentKey} hasTabularNumbers>
                {`${r.label} · ${r.line}${r.fatigue === null || r.fatigue === undefined ? "" : ` · 피곤한 정도 ${fmtIndex(r.fatigue)}`}`}
              </Text>
            ))}
          </VStack>
        </Card>
      </div>
    );
  }
  const d = n.decision;
  return (
    <div className="ui-nowcard">
      <Card>
        <VStack gap={1}>
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Heading level={4}>{`${n.label} · 지금`}</Heading>
            <Text type="supporting">{WHY_KIND_KO[n.whyKind] || n.whyKind}</Text>
            {n.ride && n.ride.legs.length > 0 && (
              <GroupBadges sources={n.ride.legs.map((l) => l.source)} />
            )}
          </HStack>
          <Text>{n.now}</Text>
          {n.ride && n.ride.legs.length > 0 && (
            <VStack gap={0}>
              {n.ride.legs.map((l, i) => {
                const band = congestionBand(l.valuePct).key;
                return (
                  <HStack key={i} gap={1} vAlign="center" wrap="wrap">
                    <span style={{ width: 8, height: 8, borderRadius: 4,
                      background: BAND_CSS[band], display: "inline-block" }} />
                    <Text type="supporting" hasTabularNumbers>
                      {`${l.line} ${l.from}→${l.to} ${fmtMinutes(l.minutes)} · 붐비는 정도 ${l.valuePct}%`}
                    </Text>
                  </HStack>
                );
              })}
            </VStack>
          )}
          {n.progress !== null && n.progress !== undefined && (
            <div className="ui-progress" role="progressbar" aria-label="현재 일정 진행률"
              aria-valuenow={Math.round(n.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="ui-progress-fill" style={{ width: `${Math.round(n.progress * 100)}%` }} />
            </div>
          )}
          <Text type="supporting">{`이렇게 한 까닭 · ${n.why}`}</Text>
          {d && d.chosen_by === "model" && d.reason_ko && (
            <Text type="supporting">“{d.reason_ko}”</Text>
          )}
          {n.criterionIds.length > 0 && (
            <HStack gap={1} vAlign="center" wrap="wrap">
              <Text type="supporting">적용한 기준</Text>
              <CriterionChips ids={n.criterionIds} />
            </HStack>
          )}
          <Text type="supporting">{`다음 일정 · ${n.next}`}</Text>
          {n.fatigue && <FatigueBar fatigue={n.fatigue} nowMin={state.clock && state.clock.minute} />}
          <TickerList events={state.ticker} />
        </VStack>
      </Card>
    </div>
  );
}

function IntroCard({ state }) {
  const m = state.simMeta;
  if (!state.introOpen || !m) return null;
  return (
    <div className="ui-intro overlay">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>이 시뮬레이션은?</Heading>
            <span className="ui-panel-spacer" />
            <Button size="sm" variant="ghost" label="닫기" onClick={() => act("setIntroOpen", false)} />
          </HStack>
          <Text>부동산 결정, 혼자 알아보기 어렵죠. 살아 보고, 돈 계산해 보고, 전세 신호를 확인하고, 도움 제도를 보고 직접 결정하세요.</Text>
          <Text type="supporting">{`같은 식구가 ${m.homes.join("와 ")}에 살면 ${m.days}일 동안 시간·돈·생활이 어떻게 다른가 — 그 질문에 답하는 시나리오예요.`}</Text>
          <MetadataList>
            <MetadataListItem label="누가 나와요">
              <Text type="supporting">{`${m.members.join(" · ")} + 가상으로 움직이는 이웃 ${m.neighbours}명`}</Text>
            </MetadataListItem>
            <MetadataListItem label="언제부터 며칠이에요">
              <Text type="supporting">{`${m.startDate}부터 ${m.days}일 (한국 시간, 1분 단위)`}</Text>
            </MetadataListItem>
            <MetadataListItem label="무엇을 재나요">
              <Text type="supporting">걸은 시간·거리(걸어서 직접 잰 시간), 장보기·산책 횟수, 저녁에 집에 머문 시간, 생활비</Text>
            </MetadataListItem>
          </MetadataList>
          {m.assumptions.length > 0 && (
            <VStack gap={1}>
              <HStack gap={1} vAlign="center">
                <Text>가정한 것</Text>
                <GroupBadges sources={m.assumptions.map((a) => a.source || "가정값")} />
              </HStack>
              {m.assumptions.map((a, i) => (
                <Text type="supporting" key={i}>
                  {a.source && a.source !== "가정값" ? `${a.label} (${a.source})` : a.label}
                </Text>
              ))}
            </VStack>
          )}
          <Text type="supporting">정하지 않는 것: 집값이 오를지, 돈을 빌릴 수 있는지, 입주 자격, 살지 말지.</Text>
        </VStack>
      </Card>
    </div>
  );
}

const fmtMetric = (unit, v) => (
  unit === "minutes" ? fmtMinutes(v) : unit === "metres" ? fmtDistance(v)
    : unit === "index" ? fmtIndex(v) : unit === "percent" ? fmtPercent(v) : fmtCount(v));

export function CompareTabBody({ state }) {
  const cmp = state.compare;
  if (state.compareLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (cmp && cmp.error) {
    return (
      <Banner status="warning" title="비교 데이터를 불러오지 못했습니다" description={cmp.error} />
    );
  }
  if (!cmp || !cmp.metrics) return null;
  return (
    <>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">출처</Text>
        <GroupBadges sources={cmp.metrics.map((m) => m.source)} />
      </HStack>
      <MetadataList>
        {cmp.metrics.map((m) => (
          <MetadataListItem key={m.key} label={m.label}>
            <Text hasTabularNumbers>{`A ${fmtMetric(m.unit, m.a)} · B ${fmtMetric(m.unit, m.b)} · Δ ${m.delta_b_minus_a > 0 ? "+" : ""}${fmtMetric(m.unit, m.delta_b_minus_a)}`}</Text>
          </MetadataListItem>
        ))}
      </MetadataList>
      {cmp.judgment && (
        <Text type="supporting">{`고른 주체 — A: ${judgmentLine(cmp.judgment.a)} / B: ${judgmentLine(cmp.judgment.b)}`}</Text>
      )}
      <Text type="supporting">그래프 = 걸어서 직접 잰 시간 · 가정값 = 미리 정해 둔 값</Text>
    </>
  );
}

export function CompareCard({ state }) {
  if (!state.compareOpen) return null;
  // Two levels so every label fits: the group row (비교 · 돈 · 안심 ·
  // 매물) then the tabs inside the active group. Switching groups jumps
  // to the group's first tab.
  const group = groupForTab(state.compareTab);
  const groupItems = COMPARE_GROUPS.map((g) => ({ value: g.id, label: g.label }));
  const tabItems = tabsInGroup(group).map((v) => ({ value: v, label: labelForTab(v) }));
  return (
    <div className="ui-compare overlay">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>30일 생활 비교</Heading>
            <span className="ui-panel-spacer" />
            <Button size="sm" variant="secondary" label="결과 공유"
              onClick={() => store.set({ shareOpen: true })} />
            <Button size="sm" variant="ghost" label="닫기" onClick={() => act("toggleCompare")} />
          </HStack>
          <SegControl label="비교 묶음" value={group}
            onChange={(g) => act("setCompareTab", tabsInGroup(g)[0])} items={groupItems} />
          <SegControl label="비교 탭" value={state.compareTab}
            onChange={(v) => act("setCompareTab", v)} items={tabItems} />
          {state.compareTab === "compare" && <CompareTabBody state={state} />}
          {state.compareTab === "priorities" && <PrioritiesTab state={state} />}
          {state.compareTab === "money" && <MoneyTab state={state} />}
          {state.compareTab === "worthit" && <WorthItTab state={state} />}
          {state.compareTab === "quality" && <QualityTab state={state} />}
          {state.compareTab === "safety" && <SafetyEduTab state={state} />}
          {state.compareTab === "jeonse" && <JeonseTab state={state} />}
          {state.compareTab === "support" && <SupportTab state={state} />}
          {state.compareTab === "listings" && <ListingsTab state={state} />}
          {state.compareTab === "listings-public" && <ListingsTab state={state} sub="public" />}
          {state.compareTab === "criteria" && <CriteriaTab state={state} />}
        </VStack>
      </Card>
    </div>
  );
}

function judgmentLine(side) {
  const s = side || {};
  const other = (s.rule || 0) + (s.replay || 0) + (s.hook || 0);
  return `Muse가 고름 ${s.model || 0} · 규칙이 대신 고름 ${s.rule_fallback || 0} · 평소대로 ${other}`;
}

function LegendCard({ state, onClose }) {
  const legend = state.legend;
  if (!legend) return null;
  const total = legend.resRows.reduce((a, r) => a + (r.count || 0), 0);
  return (
    <div className="ui-legend overlay">
      <Card>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>{legend.title}</Heading>
            <span className="ui-panel-spacer" />
            {onClose && (
              <Button size="sm" variant="ghost" label="닫기" onClick={onClose} />
            )}
          </HStack>
          <Text type="supporting" hasTabularNumbers>{`건물 ${total.toLocaleString()}동`}</Text>
          {legend.resRows.map((row) => (
            <div className="ui-legend-row" key={row.label}>
              <span className="ui-swatch" style={{ background: row.color }} aria-hidden="true" />
              <Text type="supporting">{`${row.label} ${row.count.toLocaleString()}`}</Text>
            </div>
          ))}
          {legend.heightRows.length > 0 && <Text type="supporting">높이 출처</Text>}
          {legend.heightRows.map((row) => (
            <div className="ui-legend-row" key={row.label}>
              <span className="ui-swatch" style={{ background: row.color }} aria-hidden="true" />
              <Text type="supporting">{`${row.label} ${row.count.toLocaleString()}`}</Text>
            </div>
          ))}
          {legend.simNote && <Text type="supporting">{legend.simNote}</Text>}
          <Text type="supporting">{legend.note}</Text>
        </VStack>
      </Card>
    </div>
  );
}

function AttrLine({ state }) {
  const money = state.compareTab === "money" || state.compareTab === "quality"
    || state.compareTab === "worthit" || state.compareTab === "support";
  const jeonse = state.compareTab === "jeonse";
  const safety = state.compareTab === "safety" || state.compareTab === "priorities";
  const congestion = state.region && state.region.congestion;
  return (
    <div className="ui-attr">
      <div className="overlay">
        <Text type="supporting">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL) · GIS건물통합정보 (국토교통부/VWorld) · 나무·인물은 장식용 모의 표시
          {money && " · 실거래: 국토교통부 실거래가 공개시스템(참고용) · 공공임대: LH·마이홈 (공공주택 데이터 API)"}
          {jeonse && " · 실거래: 국토교통부 실거래가 공개시스템(참고용) · 등기: GIS건물통합정보 · 체크리스트: 인터넷등기소·정부24·HUG/HF/SGI"}
          {safety && " · 치안: 경찰청 범죄 발생 지역별 통계 (2025년)"}
          {congestion && " · 혼잡도: 서울교통공사 지하철혼잡도정보(2026-09-30 기준, 공공누리 3유형)"}
        </Text>
      </div>
    </div>
  );
}

// ?agent=1 (incl. the tour's agent step) shows the tour card — the
// floating panel is gone, the chat answers from here on.
function agentAsked() {
  try {
    return typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("agent") === "1";
  } catch {
    return false;
  }
}

function restartToLanding() {
  if (typeof window !== "undefined") window.location.href = "/";
}

export function App() {
  const state = useStore();
  const [legendOpen, setLegendOpen] = useState(false);
  if (!state.ready) return null;
  if (state.mode === "landing") {
    return <Landing />;
  }
  if (state.mode === "chat") {
    return <ChatScreen />;
  }
  const isSim = state.mode === "sim";
  const settings = isSim
    ? { mode: "sim", assumptions: null,
      onIntro: () => act("setIntroOpen", true), onRestart: restartToLanding }
    : { mode: "tour", assumptions: null,
      onIntro: null, onRestart: restartToLanding };
  const toggleLegend = () => setLegendOpen(!legendOpen);
  const closeLegend = () => setLegendOpen(false);
  if (!isSim) {
    return (
      <>
        <div className="ui-topbar">
          <TopBar mode="tour" settings={settings} />
        </div>
        <MapTools state={state} legendOpen={legendOpen} onLegend={toggleLegend} />
        <CaptionCard state={state} />
        {legendOpen && <LegendCard state={state} onClose={closeLegend} />}
        {agentAsked() && <AgentTourCard />}
        {state.viewChip && (
          <div className="ui-viewchip overlay">{state.viewChip}</div>
        )}
      </>
    );
  }
  return (
    <div className="ui-sim13">
      <div className="ui-sim13-top">
        <TopBar mode="sim" settings={settings} />
      </div>
      <div className="ui-sim13-stage">
        <MapTools state={state} legendOpen={legendOpen} onLegend={toggleLegend} />
        <TimelineBar state={state} compact />
      </div>
      <div className="ui-sim13-drawer overlay">
        <NowCard state={state} />
        <JourneyCard state={state} />
        <JudgeLogCard state={state} />
        {legendOpen && <LegendCard state={state} onClose={closeLegend} />}
        <CompareCard state={state} />
      </div>
      <IntroCard state={state} />
      {agentAsked() && <AgentTourCard />}
      {state.viewChip && (
        <div className="ui-viewchip overlay">{state.viewChip}</div>
      )}
      <ShareDialog />
      <DemoTour />
    </div>
  );
}
