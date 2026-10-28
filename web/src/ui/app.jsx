// Page overlays on Astryx (React). The scene owns the 3D canvas and
// publishes state to the store; this module only renders it and routes
// UI actions back through store.act(). No three.js here.
import { useSyncExternalStore } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Slider } from "@astryxdesign/core/Slider";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { useState } from "react";
import { store } from "./store.js";
import { ConsultPanel } from "./consult.jsx";
import { CriteriaTab } from "./criteria.jsx";
import { MoneyTab, QualityTab } from "./money.jsx";
import { fmtMinutes, fmtDistance, fmtCount, fmtIndex, badgeFor } from "../money/format.js";
import { BAND_LABEL, BAND_ORDER } from "../journey.js";
import { congestionBand } from "../engine/journey.js";
import { FATIGUE_MODEL_NOTE } from "../nowcard.js";

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

const act = (name, ...args) => store.act(name, ...args);

const MODE_ITEMS = [
  { value: "tour", label: "투어" },
  { value: "sim", label: "생활 시뮬레이션" },
];

function SegControl({ label, value, onChange, items, size }) {
  return (
    <SegmentedControl label={label} value={value} onChange={onChange} size={size || "sm"}>
      {items.map((it) => (
        <SegmentedControlItem key={it.value} value={it.value} label={it.label} />
      ))}
    </SegmentedControl>
  );
}

function TopBar({ state }) {
  const isSim = state.mode === "sim";
  return (
    <div className="ui-topbar">
      <div className="ui-topbar-inner overlay">
        <Card>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <HStack gap={1} vAlign="center">
              <Heading level={3}>주거 시뮬레이터</Heading>
              <Badge variant="orange" label="미니어처" />
            </HStack>
            {isSim ? (
              <SegControl label="홈 선택" value={state.home}
                onChange={(v) => act("selectHome", v)}
                items={state.homes.map((h) => ({ value: h.label, label: h.label }))} />
            ) : (
              <SegControl label="지역 선택" value={state.area.id}
                onChange={(v) => act("selectArea", v)} items={state.areaOptions} />
            )}
            <SegControl label="모드 선택" value={state.mode}
              onChange={(v) => act("selectMode", v)} items={MODE_ITEMS} />
            <HStack gap={2} vAlign="center">
              {!isSim && (
                <Button size="sm" label={state.tourPlaying ? "일시정지" : "재생"}
                  onClick={() => act("toggleTourPlay")} />
              )}
              {isSim && (
                <Button size="sm" variant="ghost" label="이 시뮬레이션은?"
                  onClick={() => act("setIntroOpen", true)} />
              )}
              <ToggleButton size="sm" label="주거만 강조" isPressed={state.resOnly}
                onPressedChange={(next) => act("setResOnly", next)} />
              <ToggleButton size="sm" label="상담" isPressed={state.consultOpen}
                onPressedChange={(next) => act("setConsultOpen", next)} />
            </HStack>
          </HStack>
        </Card>
      </div>
    </div>
  );
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function SimBar({ state }) {
  const { clock } = state;
  return (
    <div className="ui-simbar overlay">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text hasTabularNumbers>{clock.label}</Text>
            <Button size="sm" label={state.playing ? "일시정지" : "재생"}
              onClick={() => act("toggleSimPlay")} />
            <SegControl label="재생 속도" value={String(state.speed)}
              onChange={(v) => act("setSpeed", Number(v))}
              items={[{ value: "1", label: "1×" }, { value: "10", label: "10×" }, { value: "60", label: "60×" }]} />
            <Button size="sm" label="A·B 비교" variant="secondary"
              onClick={() => act("toggleCompare")} />
          </HStack>
          <div className="ui-simbar-sliders">
            <Slider label="일차" min={1} max={clock.days} step={1} value={clock.day + 1}
              formatValue={(v) => `${v}일차`} valueDisplay="text"
              onChange={(v) => act("setDay", v - 1)} />
            <Slider label="시간" min={0} max={1439} step={1} value={Math.floor(clock.minute)}
              formatValue={(v) => hhmm(v)} valueDisplay="text"
              onChange={(v) => act("setMinute", v)} />
          </div>
          <SegControl label="따라가기" value={String(state.follow)}
            onChange={(v) => act("setFollow", Number(v))}
            items={state.followOptions} />
          {state.simTicks.length > 0 && (
            <div className="ui-ticks" role="group" aria-label="판단·출발 순간 (누르면 이동)">
              {state.simTicks.map((t, i) => (
                <button key={`${t.kind}-${t.minute}-${i}`}
                  className={`ui-tick ui-tick-${t.kind}`}
                  style={{ left: `${(t.minute / 1439 * 100).toFixed(2)}%` }}
                  title={`${hhmm(t.minute)} ${t.kind === "decision" ? "판단" : "출발"}`}
                  aria-label={`${hhmm(t.minute)} ${t.kind === "decision" ? "판단" : "출발"}로 이동`}
                  onClick={() => act("setMinute", t.minute)} />
              ))}
            </div>
          )}
        </VStack>
      </Card>
    </div>
  );
}

const JUDGE_BADGE = { rule: "neutral", spark: "blue", open: "purple" };

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
                <Badge variant={JUDGE_BADGE[j.badgeCls] || "neutral"} label={j.badgeText} />
                {state.judgeLive && <Badge variant="success" label="live" />}
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
            <Heading level={4}>판단 기록</Heading>
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
                    <Badge variant={JUDGE_BADGE[row.badgeCls] || "neutral"} label={row.badgeText} />
                    {state.judgeFlash === row.id && <Badge variant="orange" label="지금" />}
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

const WHY_KIND_KO = { routine: "일상 규칙", decision: "판단", input: "고객 입력", none: "기록 없음" };

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
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="하루 피로도">
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

function FatigueBar({ fatigue, nowMin }) {
  const f = fatigue;
  const width = `${Math.max(0, Math.min(100, f.value))}%`;
  const deltaText = f.delta === null || f.delta === undefined
    ? "" : ` (${f.delta > 0 ? "+" : ""}${Math.round(f.delta * 10) / 10})`;
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>{`피로도 ${fmtIndex(f.value)}${deltaText}`}</Text>
        {f.source && <Badge variant="neutral" label={f.source === "서울교통공사" ? "실측" : "가정값"} />}
      </HStack>
      <div className="ui-progress" role="progressbar" aria-label="피로도 지수"
        aria-valuenow={Math.round(f.value)} aria-valuemin={0} aria-valuemax={100}>
        <div className="ui-progress-fill" style={{ width }} />
      </div>
      {f.note && <Text type="supporting">{f.note}</Text>}
      <FatigueSpark series={f.series} nowMin={nowMin} />
      <Text type="supporting">{FATIGUE_MODEL_NOTE}</Text>
      {f.criterionIds.length > 0 && (
        <HStack gap={1} vAlign="center" wrap="wrap">
          {f.criterionIds.map((id) => (
            <Button key={id} size="sm" variant="ghost" label={id}
              onClick={() => act("openCriterion", id)} />
          ))}
        </HStack>
      )}
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
          <HStack gap={1} vAlign="center">
            <Heading level={4}>이동 중</Heading>
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
                <div className="ui-progress" role="progressbar" aria-label="승차 진행률"
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
                        {`${l.line} ${l.from}→${l.to} ${fmtMinutes(l.minutes)} · 혼잡도 ${l.valuePct}%`}
                      </Text>
                      <Badge variant="neutral" label={l.source === "서울교통공사" ? "실측" : "가정값"} />
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
              <Text type="supporting">{`혼잡도: ${journey.congestionSource}`}</Text>
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
            <Heading level={4}>지금 가구 모습 (자유 시점)</Heading>
            {n.rows.map((r) => (
              <Text key={r.agentKey} hasTabularNumbers>
                {`${r.label} · ${r.line}${r.fatigue === null || r.fatigue === undefined ? "" : ` · 피로 ${fmtIndex(r.fatigue)}`}`}
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
            <Badge variant="neutral" label={WHY_KIND_KO[n.whyKind] || n.whyKind} />
          </HStack>
          <Text>{n.now}</Text>
          {n.progress !== null && n.progress !== undefined && (
            <div className="ui-progress" role="progressbar" aria-label="현재 일정 진행률"
              aria-valuenow={Math.round(n.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="ui-progress-fill" style={{ width: `${Math.round(n.progress * 100)}%` }} />
            </div>
          )}
          <Text type="supporting">{`왜 · ${n.why}`}</Text>
          {d && d.chosen_by === "model" && (
            <HStack gap={1} vAlign="center" wrap="wrap">
              <Badge variant={d.provider === "baseten" ? "purple" : "blue"}
                label={d.provider === "baseten" ? "Muse Spark Open" : "Muse Spark 1.3"} />
              {d.reason_ko && <Text type="supporting">“{d.reason_ko}”</Text>}
            </HStack>
          )}
          {n.criterionIds.length > 0 && (
            <HStack gap={1} vAlign="center" wrap="wrap">
              <Text type="supporting">기준</Text>
              {n.criterionIds.map((id) => (
                <Button key={id} size="sm" variant="ghost" label={id}
                  onClick={() => act("openCriterion", id)} />
              ))}
            </HStack>
          )}
          <Text type="supporting">{`다음 · ${n.next}`}</Text>
          {n.fatigue && <FatigueBar fatigue={n.fatigue} nowMin={state.clock && state.clock.minute} />}
          {state.ticker.length > 0 && (
            <VStack gap={0}>
              {state.ticker.map((e, i) => (
                <Text key={i} type="supporting" hasTabularNumbers>{e.text}</Text>
              ))}
            </VStack>
          )}
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
          <Text>{`같은 가구가 ${m.homes.join("와 ")}에 살면 ${m.days}일 동안 시간·돈·생활이 어떻게 다른가 — 그 질문에 답하는 시나리오입니다.`}</Text>
          <MetadataList>
            <MetadataListItem label="누가">
              <Text type="supporting">{`${m.members.join(" · ")} + 시뮬레이션 이웃 ${m.neighbours}명`}</Text>
            </MetadataListItem>
            <MetadataListItem label="언제">
              <Text type="supporting">{`${m.startDate}부터 ${m.days}일 (KST, 1분 단위)`}</Text>
            </MetadataListItem>
            <MetadataListItem label="무엇을 재나">
              <Text type="supporting">도보 시간·거리(그래프 실측), 장보기·산책 횟수, 저녁 재택, 생활비</Text>
            </MetadataListItem>
          </MetadataList>
          {m.assumptions.length > 0 && (
            <VStack gap={1}>
              <Text>가정한 것</Text>
              {m.assumptions.map((a, i) => (
                <HStack gap={1} vAlign="center" key={i}>
                  <Text type="supporting">{a.label}</Text>
                  <Badge variant="orange" label={a.source || "가정값"} />
                </HStack>
              ))}
            </VStack>
          )}
          <Text type="supporting">판단하지 않는 것: 집값 전망, 대출 가능 여부, 입주 자격, 매매 판단.</Text>
        </VStack>
      </Card>
    </div>
  );
}

const fmtMetric = (unit, v) => (
  unit === "minutes" ? fmtMinutes(v) : unit === "metres" ? fmtDistance(v)
    : unit === "index" ? fmtIndex(v) : fmtCount(v));

function CompareTabBody({ state }) {
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
      <MetadataList>
        {cmp.metrics.map((m) => (
          <MetadataListItem key={m.key} label={m.label}>
            <HStack gap={1} vAlign="center" wrap="wrap">
              <Text hasTabularNumbers>{`A ${fmtMetric(m.unit, m.a)} · B ${fmtMetric(m.unit, m.b)} · Δ ${m.delta_b_minus_a > 0 ? "+" : ""}${fmtMetric(m.unit, m.delta_b_minus_a)}`}</Text>
              <Badge variant={m.source === "graph" ? "teal" : "orange"}
                label={badgeFor(m.source)} />
            </HStack>
          </MetadataListItem>
        ))}
      </MetadataList>
      {cmp.judgment && (
        <Text type="supporting">{`판단 주체 — A: ${judgmentLine(cmp.judgment.a)} / B: ${judgmentLine(cmp.judgment.b)}`}</Text>
      )}
      <Text type="supporting">그래프 = 도보 그래프 실측 · 가정값 = 시나리오 가정값</Text>
    </>
  );
}

const COMPARE_TABS = [
  { value: "compare", label: "A·B 비교" },
  { value: "money", label: "생활비" },
  { value: "quality", label: "삶의 질" },
  { value: "criteria", label: "기준" },
];

function CompareCard({ state }) {
  if (!state.compareOpen) return null;
  return (
    <div className="ui-compare overlay">
      <Card>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>30일 생활 비교</Heading>
            <span className="ui-panel-spacer" />
            <Button size="sm" variant="ghost" label="닫기" onClick={() => act("toggleCompare")} />
          </HStack>
          <SegControl label="비교 탭" value={state.compareTab}
            onChange={(v) => act("setCompareTab", v)} items={COMPARE_TABS} />
          {state.compareTab === "compare" && <CompareTabBody state={state} />}
          {state.compareTab === "money" && <MoneyTab state={state} />}
          {state.compareTab === "quality" && <QualityTab state={state} />}
          {state.compareTab === "criteria" && <CriteriaTab state={state} />}
        </VStack>
      </Card>
    </div>
  );
}

function judgmentLine(side) {
  const s = side || {};
  const other = (s.rule || 0) + (s.replay || 0) + (s.hook || 0);
  return `모델 ${s.model || 0} · 폴백 ${s.rule_fallback || 0} · 규칙 ${other}`;
}

function LegendCard({ state }) {
  const legend = state.legend;
  const [open, setOpen] = useState(false);
  if (!legend) return null;
  const total = legend.resRows.reduce((a, r) => a + (r.count || 0), 0);
  return (
    <div className="ui-legend overlay">
      <Card>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>{legend.title}</Heading>
            <span className="ui-panel-spacer" />
            <Button size="sm" variant="ghost" label={open ? "접기" : `${total.toLocaleString()}동`}
              onClick={() => setOpen(!open)} />
          </HStack>
          {open && (
            <>
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
            </>
          )}
        </VStack>
      </Card>
    </div>
  );
}

function AttrLine({ state }) {
  const money = state.compareTab === "money" || state.compareTab === "quality";
  const congestion = state.region && state.region.congestion;
  return (
    <div className="ui-attr">
      <div className="overlay">
        <Text type="supporting">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL) · GIS건물통합정보 (국토교통부/VWorld) · 나무·인물은 장식용 모의 표시
          {money && " · 실거래: 국토교통부 실거래가 공개시스템(참고용) · 공공임대: LH·마이홈 (공공주택 데이터 API)"}
          {congestion && " · 혼잡도: 서울교통공사 지하철혼잡도정보(2026-09-30 기준, 공공누리 3유형)"}
        </Text>
      </div>
    </div>
  );
}

export function App() {
  const state = useStore();
  if (!state.ready) return null;
  const isSim = state.mode === "sim";
  return (
    <>
      <TopBar state={state} />
      {isSim && <SimBar state={state} />}
      {!isSim && <CaptionCard state={state} />}
      {isSim && (
        <div className="ui-simleft overlay">
          <NowCard state={state} />
          <JourneyCard state={state} />
          <JudgeLogCard state={state} />
        </div>
      )}
      {isSim && <IntroCard state={state} />}
      {isSim && <CompareCard state={state} />}
      <LegendCard state={state} />
      <AttrLine state={state} />
      {state.viewChip && (
        <div className="ui-viewchip overlay">
          <Badge variant="info" label={state.viewChip} />
        </div>
      )}
      <ConsultPanel />
    </>
  );
}
