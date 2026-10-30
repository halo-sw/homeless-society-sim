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
import { MoneyTab, QualityTab, tenureOf } from "./money.jsx";
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
import { chipDisplay, tickerDisplay, FATIGUE_MODEL_NOTE } from "../nowcard.js";
import { hhmm, navFromOutings, outingIndexAt, stepIndexAt } from "../timeline.js";
import { ActivityIcon, ActivityLegend } from "./timeline.jsx";
import { priorityValues, myScore } from "../priorities.js";

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

export function CaptionCard({ state }) {
  const c = state.caption;
  if (!c) return null;
  const j = state.judge;
  // The engine's meta packs "label · category · coordinates" — the card
  // shows the label only, with the walk line under it. No categories,
  // no coordinates.
  const kind = String(c.meta || "").split(" · ")[0].trim();
  return (
    <div className="ui-caption overlay">
      <Card>
        <VStack gap={2}>
          <VStack gap={0}>
            <Heading level={4}>{c.name}</Heading>
            {kind && <Text type="supporting">{kind}</Text>}
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

function JudgeLogCard({ state, bare }) {
  if (state.judgeLog.length === 0) return null;
  const body = (
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
  );
  // 13f2: inside the drawer section the card chrome goes (no nested
  // cards); the standalone overlay keeps it.
  if (bare) return <div className="ui-judgelog-bare">{body}</div>;
  return (
    <div className="ui-judgelog overlay">
      <Card>{body}</Card>
    </div>
  );
}

const WHY_KIND_KO = { routine: "평소 습관", decision: "고른 것", input: "고객님이 정한 것", none: "기록 없음" };

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

// 13f2: criteria as small text tags (still buttons underneath, so the
// criterion tab keeps opening); the rest hide behind "+N개".
function CriterionChips({ ids }) {
  const [open, setOpen] = useState(false);
  const { visible, hiddenCount } = chipDisplay(ids, open);
  if (visible.length === 0) return null;
  return (
    <div className="ui-tags">
      {visible.map((id) => (
        // 13e4: the Korean rule title on the tag; the internal id
        // stays in `title` only.
        <button key={id} type="button" className="ui-tag" title={id}
          onClick={() => act("openCriterion", id)}>
          {criterionTitle(id)}
        </button>
      ))}
      {hiddenCount > 0 && (
        <button type="button" className="ui-tag ui-tag-more"
          onClick={() => setOpen(!open)}>
          {open ? "접기" : `+${hiddenCount}개`}
        </button>
      )}
    </div>
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

// The ride note names the leg ("신분당선 강남→판교 붐비는 정도 70%, …")
// — the hero and the 오늘 list already say that, so only the posture
// half stays here.
function shortFatigueNote(note) {
  const s = String(note || "");
  if (!s) return "";
  const m = /붐비는 정도 /.exec(s);
  return m ? s.slice(m.index) : s;
}

function FatigueBlock({ fatigue, nowMin }) {
  const f = fatigue;
  const width = `${Math.max(0, Math.min(100, f.value))}%`;
  const deltaText = f.delta === null || f.delta === undefined
    ? "" : ` (${f.delta > 0 ? "+" : ""}${Math.round(f.delta * 10) / 10})`;
  const peakLine = f.peakCongestion ? congestionPeakLine(f.peakCongestion) : null;
  const note = shortFatigueNote(f.note);
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
      {note && <Text type="supporting">{note}</Text>}
      {peakLine && (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting" hasTabularNumbers>{`오늘 가장 붐비는 순간 · ${peakLine}`}</Text>
          <SourceBadge source={f.peakCongestion.source} />
        </HStack>
      )}
      <FatigueSpark series={f.series} nowMin={nowMin} />
      <Text type="supporting">피곤한 정도는 가정 모델이에요</Text>
      <CriterionChips ids={f.criterionIds} />
    </VStack>
  );
}

// 13f2: the 오늘 list — the day's trips as one compact line per leg.
// Replaces JourneyCard and the duplicated leg lines (NowCard, spark
// caption). Step labels keep their engine text; only the trailing
// source word moves into a badge at the end of the line.
const STEP_ICON = { place: "home", walk: "walk", ride: "subway", transfer: "subway", stay: "other" };

function stepLabelShown(label) {
  return String(label || "").replace(/ (실측|가정)\)$/, ")");
}

export function TodayList({ state }) {
  const journey = state.journey;
  const loading = state.journeyLoading;
  const outings = (state.routeSteps && state.routeSteps.outings) || [];
  const minute = Math.floor(state.clock.minute);
  if (outings.length === 0 && !journey && !loading) return null;
  const at = outingIndexAt(outings, minute);
  const nav = navFromOutings(outings, minute);
  const jump = (m) => act("setMinute", Math.max(0, Math.min(1439, Math.round(m))));
  return (
    <div className="ui-today" data-testid="today-list">
      <div className="ui-today-nav">
        <Button size="sm" variant="ghost" label="◀ 이전 이동"
          isDisabled={nav.prev === null}
          onClick={() => nav.prev !== null && jump(nav.prev)} />
        <Button size="sm" variant="ghost" label="다음 이동 ▶"
          isDisabled={nav.next === null}
          onClick={() => nav.next !== null && jump(nav.next)} />
        <span className="ui-panel-spacer" />
        {(journey || loading) && (
          <HStack gap={1} vAlign="center">
            {[["auto", "자동"], ["low", "거리 보기"], ["high", "전체 경로"]].map(([v, label]) => (
              <Button key={v} size="sm" variant={state.journeyView === v ? "secondary" : "ghost"}
                label={label} onClick={() => act("setJourneyView", v)} />
            ))}
          </HStack>
        )}
      </div>
      {loading && <Text type="supporting">{loading}</Text>}
      {outings.map((o, oi) => {
        const current = oi === at ? stepIndexAt(o.steps || [], minute) : -1;
        return (
          <div key={oi} className="ui-today-outing">
            {(o.steps || []).map((s, i) => {
              const band = s.congestion ? congestionBand(s.congestion.valuePct).key : null;
              const isNow = oi === at && i === current;
              return (
                <button key={i} type="button" data-current={isNow}
                  className={isNow ? "ui-today-row ui-today-now" : "ui-today-row"}
                  onClick={() => jump(s.minute)}
                  aria-label={`${hhmm(s.minute)} ${s.label}${isNow ? " (지금)" : ""}`}>
                  <span className="ui-today-time">{hhmm(s.minute)}</span>
                  <ActivityIcon activity={STEP_ICON[s.kind] || "other"} />
                  <span className="ui-today-label">{stepLabelShown(s.label)}</span>
                  {band && (
                    <span className={`ui-dot ui-dot-${band}`} aria-hidden="true" />
                  )}
                  {s.congestion && <SourceBadge source={s.congestion.source} />}
                </button>
              );
            })}
          </div>
        );
      })}
      {journey && (
        <div className="ui-today-foot">
          <HStack gap={1} vAlign="center" wrap="wrap">
            {BAND_ORDER.map((b) => (
              <HStack key={b} gap={1} vAlign="center">
                <span className={`ui-dot ui-dot-${b}`} aria-hidden="true" />
                <Text type="supporting">{BAND_LABEL[b]}</Text>
              </HStack>
            ))}
          </HStack>
          <Text type="supporting">{journey.corridorLabel}</Text>
          {journey.detailNote && <Text type="supporting">{journey.detailNote}</Text>}
          <Text type="supporting">{`붐비는 정도 자료: ${journey.congestionSource}`}</Text>
        </div>
      )}
    </div>
  );
}

// 13f2: the drawer answers "지금 이 사람은 어떤 상황인가?" first
// (hero), everything else one tap away (three folded sections, 오늘
// open). Each fact appears once: the current leg in the hero, every
// leg in 오늘, the reasons in 왜, records in 비교·기록.
const STATUS_CHIP = { trip: "이동 중", ride: "이동 중", home: "집", away: "직장", place: "외출" };

function heroSentence(state) {
  const n = state.now;
  if (state.journey && state.journey.where) return state.journey.where;
  if (n.ride && n.ride.where) return n.ride.where;
  return n.now;
}

// The hero's big number: minutes left in the current situation, from
// the journey/ride payload when riding, else read off the engine's
// own one-line wording (walk remain, stay remain, work end time).
function heroBig(state) {
  const n = state.now;
  const left = state.journey && Number.isFinite(state.journey.minutesLeft)
    ? state.journey.minutesLeft
    : n.ride && Number.isFinite(n.ride.minutesLeft) ? n.ride.minutesLeft : null;
  if (left !== null) return `${left}분 남음`;
  const m = /(\d+)분 남음/.exec(n.now);
  if (m) return `${m[1]}분 남음`;
  if (/곧 도착/.test(n.now)) return "곧 도착";
  const stay = /(\d+)분 머묾/.exec(n.now);
  if (stay) return `${stay[1]}분 머묾`;
  const end = /(\d{2}):(\d{2})까지/.exec(n.now);
  if (end && state.clock) {
    const rest = (Number(end[1]) * 60 + Number(end[2])) - Math.floor(state.clock.minute);
    if (rest >= 0) return `${rest}분 남음`;
  }
  return "";
}

function heroLeg(state) {
  const j = state.journey;
  if (j && j.legs && Number.isFinite(j.legIndex) && j.legs[j.legIndex]) return j.legs[j.legIndex];
  const r = state.now && state.now.ride;
  if (r && r.legs && r.legs.length === 1) return r.legs[0];
  return null;
}

function SimHero({ state }) {
  const n = state.now;
  if (!n) return null;
  if (n.free) {
    return (
      <div className="ui-hero" data-testid="sim-hero">
        <div className="ui-hero-top">
          <span className="ui-hero-name">지금 식구들 모습</span>
        </div>
        {n.rows.map((r) => (
          <div key={r.agentKey} className="ui-hero-line">
            {`${r.label} · ${r.line}${r.fatigue === null || r.fatigue === undefined ? "" : ` · 피곤한 정도 ${fmtIndex(r.fatigue)}`}`}
          </div>
        ))}
      </div>
    );
  }
  const big = heroBig(state);
  const leg = heroLeg(state);
  const band = leg ? congestionBand(leg.valuePct).key : null;
  const pct = leg ? Math.round(leg.valuePct) : 0;
  return (
    <div className="ui-hero" data-testid="sim-hero">
      <div className="ui-hero-top">
        <span className="ui-hero-name">{n.label}</span>
        <span className="ui-tag">{STATUS_CHIP[n.state] || "지금"}</span>
      </div>
      <div className="ui-hero-line">{heroSentence(state)}</div>
      {big && <div className="ui-hero-big">{big}</div>}
      {leg && (
        <div className="ui-hero-cong">
          <div className="ui-progress" role="progressbar" aria-label="타는 구간 붐비는 정도"
            aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`ui-progress-fill ui-fill-${band}`}
              style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <div className="ui-hero-cong-line">
            <span>{`혼잡 ${pct}%`}</span>
            <SourceBadge source={leg.source} />
          </div>
        </div>
      )}
      <div className="ui-hero-next">{`다음: ${n.next}`}</div>
    </div>
  );
}

function WhySection({ state }) {
  const n = state.now;
  if (!n || n.free) return null;
  const d = n.decision;
  return (
    <VStack gap={2}>
      <Text type="supporting">{`이렇게 한 까닭 · ${WHY_KIND_KO[n.whyKind] ? `${WHY_KIND_KO[n.whyKind]} · ` : ""}${n.why}`}</Text>
      {d && d.chosen_by === "model" && d.reason_ko && (
        <Text type="supporting">“{d.reason_ko}”</Text>
      )}
      {n.criterionIds.length > 0 && (
        <VStack gap={1}>
          <Text type="supporting">적용한 기준</Text>
          <CriterionChips ids={n.criterionIds} />
        </VStack>
      )}
      {n.fatigue && <FatigueBlock fatigue={n.fatigue} nowMin={state.clock && state.clock.minute} />}
    </VStack>
  );
}

function RecordSection({ state }) {
  return (
    <VStack gap={2}>
      <TickerList events={state.ticker} />
      <JudgeLogCard state={state} bare />
      <CompareCard state={state} bare />
    </VStack>
  );
}

// 17-2: 내 기준 점수 — the answer first. One row per home in A/B
// order above the hero; both bars use the neutral fill, never sorted,
// never crowned. Tap opens the 내 기준 tab (group bars + formula).
export function MyScoreRow({ state }) {
  const doc = state.money;
  if (state.moneyLoading || !doc || doc.error) return null;
  const labels = Object.keys(doc.homes || {});
  if (labels.length === 0) return null;
  const tenures = {};
  for (const label of labels) tenures[label] = tenureOf(state, label, doc);
  const pw = state.priorityWeights;
  const explicit = !!(pw && pw.explicit);
  const scored = myScore(priorityValues(doc, state.compare, tenures),
    pw ? pw.weights : null, { explicit });
  if (!scored.ok) return null;
  const openTab = () => {
    store.set({ compareOpen: true, compareTab: "priorities" });
    revealCompareSection();
  };
  const num = (l) => (scored.scores[l] === null || scored.scores[l] === undefined ? "–" : scored.scores[l]);
  return (
    <div className="ui-myscore" data-testid="myscore-row" onClick={openTab}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openTab(); }}
      aria-label="내 기준 점수 · 내 기준 탭으로 이동">
      <div className="ui-myscore-head">
        <span className="ui-myscore-title">내 기준 점수</span>
        <span className="ui-myscore-line">{labels.map((l) => `${l} ${num(l)}`).join(" · ")}</span>
      </div>
      {labels.map((l) => (
        <div className="ui-myscore-row" key={l}>
          <span className="ui-myscore-label">{l}</span>
          <div className="ui-progress" role="progressbar" aria-label={`${l} 내 기준 점수`}
            aria-valuenow={num(l) === "–" ? 0 : num(l)} aria-valuemin={0} aria-valuemax={100}>
            <div className="ui-progress-fill"
              style={{ width: `${num(l) === "–" ? 0 : num(l)}%` }} />
          </div>
          <span className="ui-myscore-num">{num(l)}</span>
        </div>
      ))}
      <div className="ui-myscore-cap">
        <span>{scored.caption}</span>
        {!explicit && (
          <span>
            {" · "}
            <button type="button" className="ui-myscore-link"
              onClick={(e) => { e.stopPropagation(); openTab(); }}>비중 정하기</button>
          </span>
        )}
      </div>
    </div>
  );
}

// 17-3: 살아 보니 — three one-line moments from the 30 days, open by
// default. Tap seeks the timeline to that moment and follows the
// member (existing seek actions; data-* attrs pin the target).
function MomentsSection({ state }) {
  const moments = state.moments;
  if (!moments || moments.length === 0) return null;
  const seek = (m) => {
    act("setDay", m.day);
    act("setMinute", m.minute);
    if (m.followIndex > 0) act("setFollow", m.followIndex);
  };
  return (
    <details className="ui-section" open data-testid="section-moments">
      <summary className="ui-section-head">살아 보니</summary>
      <div className="ui-section-body">
        <VStack gap={1}>
          {moments.map((m) => (
            <button key={`${m.kind}:${m.evidence.type}:${m.evidence.id}`}
              type="button" className="ui-moment"
              data-day={m.day} data-minute={m.minute}
              data-follow={m.followIndex || 0}
              onClick={() => seek(m)}
              aria-label={`${m.dayLabel} ${m.timeLabel} ${m.home} ${m.text_ko || m.sentence}`}>
              <span className="ui-moment-when">{`${m.dayLabel} ${m.timeLabel}`}</span>
              <span className="ui-tag ui-moment-home">{m.home}</span>
              <span className="ui-moment-text">{m.text_ko || m.sentence}</span>
              <span className="ui-tag">근거 ✓</span>
            </button>
          ))}
        </VStack>
      </div>
    </details>
  );
}

export function SimDrawer({ state }) {
  return (
    <div className="ui-drawer13f2">
      <MyScoreRow state={state} />
      <MomentsSection state={state} />
      <SimHero state={state} />
      <details className="ui-section" open data-testid="section-today">
        <summary className="ui-section-head">오늘</summary>
        <div className="ui-section-body">
          <TodayList state={state} />
        </div>
      </details>
      <details className="ui-section" data-testid="section-why">
        <summary className="ui-section-head">왜 이렇게 판단했나</summary>
        <div className="ui-section-body">
          <WhySection state={state} />
        </div>
      </details>
      <details className="ui-section" data-testid="section-compare">
        <summary className="ui-section-head">비교·기록</summary>
        <div className="ui-section-body">
          <RecordSection state={state} />
        </div>
      </details>
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

// 18: plain-words reading of one compare row (neutral, numbers kept).
// Minutes totals read as 하루 평균 (delta/days); counts read as 30-day
// totals; fatigue reads lower-is-better with both values; null reads
// nothing, a zero delta reads 같아요.
const PLAIN_MINUTES_VERB = {
  walk_minutes: "걸어요",
  commute_walk_minutes: "출퇴근길에 걸어요",
  commute_ride_minutes: "차·지하철을 타요",
  home_evening_minutes: "저녁에 집에 머물러요",
  fatigue_crowded_min: "만원 지하철을 타요",
};
const PLAIN_COUNT_NOUN = {
  errands_done: "장보기",
  park_visits: "공원 산책",
  trips: "걸어서 이동",
};
const PLAIN_FATIGUE_NOUN = {
  fatigue_arrival_work_avg: "회사 도착할 때",
  fatigue_after_home_avg: "퇴근해서 집에 왔을 때",
  fatigue_avg_30d: "하루 평균 (쉬는 시간 포함)",
};
export function plainMetricLine(m, days = 30) {
  if (!m) return null;
  const d = m.delta_b_minus_a;
  if (d === null || d === undefined || !Number.isFinite(m.a) || !Number.isFinite(m.b)) return null;
  if (d === 0) return "A와 B가 같아요";
  const span = Number(days) > 0 ? Number(days) : 30;
  const win = d > 0 ? "B" : "A";
  if (m.unit === "minutes" && PLAIN_MINUTES_VERB[m.key]) {
    const perDay = Math.round((Math.abs(d) / span) * 10) / 10;
    if (!(perDay >= 1)) {
      return `${win}가 30일 동안 모두 ${fmtMinutes(Math.abs(d))} 더 ${PLAIN_MINUTES_VERB[m.key]}`;
    }
    return `${win}가 하루 평균 ${fmtMinutes(Math.round(perDay))} 더 ${PLAIN_MINUTES_VERB[m.key]}`;
  }
  if ((m.unit === "count" || m.unit === "metres") && PLAIN_COUNT_NOUN[m.key]) {
    const n = m.unit === "metres" ? fmtDistance(Math.abs(d)) : fmtCount(Math.abs(d), "번");
    return `${win}가 ${PLAIN_COUNT_NOUN[m.key]} ${n} 더`;
  }
  if (m.unit === "metres") {
    return `${win}가 하루 평균 ${fmtDistance(Math.abs(d) / span)} 더 걸어요`;
  }
  if (m.unit === "index" && PLAIN_FATIGUE_NOUN[m.key]) {
    const less = m.a <= m.b ? "A" : "B";
    return `${less}가 ${PLAIN_FATIGUE_NOUN[m.key]} 덜 피곤해요 (A ${fmtIndex(m.a)} · B ${fmtIndex(m.b)})`;
  }
  if (m.unit === "percent" && m.key === "fatigue_peak_congestion_pct") {
    return `${win}가 출근길 가장 붐비는 순간 ${Math.round(Math.abs(d) * 10) / 10}%포인트 더 붐벼요`;
  }
  return null;
}

// 18: the facts behind the removed internal lines, in plain language:
// who chose (rules vs model), what is measured vs assumed, and the
// coordinate anchor when the scene has no complex name.
export function howCalculatedLines(cmp) {
  const lines = [];
  const j = (cmp && cmp.judgment) || {};
  const modelN = (s) => (s && s.model) || 0;
  const total = modelN(j.a) + modelN(j.b);
  if (total === 0) {
    lines.push(`이 ${cmp.days || 30}일은 정해 둔 생활 규칙으로 만들었어요. Muse 판단이 들어간 날: 0일`);
  } else {
    lines.push(`정해 둔 생활 규칙대로 만들었고, Muse가 정한 장면이 A ${modelN(j.a)}개 · B ${modelN(j.b)}개 있어요`);
  }
  lines.push("걸어서 직접 잰 시간은 도보 그래프로 잰 값이고, 차·지하철을 탄 시간과 횟수는 미리 정해 둔 값이에요");
  lines.push(FATIGUE_MODEL_NOTE);
  for (const a of (cmp && cmp.anchors) || []) {
    if (a && a.method === "coordinate") {
      lines.push(`${a.label}는 3D 장면에 단지 이름이 없어 집 위치에서 시작했어요`);
    }
  }
  return lines;
}

export function CompareTabBody({ state }) {
  const cmp = state.compare;
  if (state.compareLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (cmp && cmp.error) {
    return (
      <Banner status="warning" title="비교 데이터를 불러오지 못했습니다" description={cmp.error} />
    );
  }
  if (!cmp || !cmp.metrics) return null;
  const days = Number(cmp.days) > 0 ? Number(cmp.days) : 30;
  const how = howCalculatedLines(cmp);
  return (
    <>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">출처</Text>
        <GroupBadges sources={cmp.metrics.map((m) => m.source)} />
      </HStack>
      {cmp.metrics.some((m) => m.unit === "index") && (
        <Text type="supporting">피곤한 정도 0–10, 높을수록 피곤해요</Text>
      )}
      <MetadataList>
        {cmp.metrics.map((m) => {
          const plain = plainMetricLine(m, days);
          return (
            <MetadataListItem key={m.key} label={m.label}>
              <Text hasTabularNumbers>{`A ${fmtMetric(m.unit, m.a)} · B ${fmtMetric(m.unit, m.b)} · Δ ${m.delta_b_minus_a > 0 ? "+" : ""}${fmtMetric(m.unit, m.delta_b_minus_a)}`}</Text>
              {plain && <Text type="supporting">{plain}</Text>}
            </MetadataListItem>
          );
        })}
      </MetadataList>
      <details className="ui-section">
        <summary className="ui-section-head">어떻게 계산했나요</summary>
        <div className="ui-section-body">
          <VStack gap={1}>
            {how.map((l, i) => (
              <Text key={i} type="supporting">{l}</Text>
            ))}
          </VStack>
        </div>
      </details>
    </>
  );
}

// 18: "A·B 비교" must land somewhere visible: expand the drawer's
// 비교·기록 section and scroll it into view (the card renders inside
// it). Takes a document-like so tests pass a fake. Returns true when
// a section was revealed.
export function revealCompareSection(root) {
  try {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    const el = doc.querySelector('[data-testid="section-compare"]');
    if (!el) return false;
    el.open = true;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
    return true;
  } catch {
    return false;
  }
}

export function CompareCard({ state, bare }) {
  if (!state.compareOpen) return null;
  // Two levels so every label fits: the group row (비교 · 돈 · 안심 ·
  // 매물) then the tabs inside the active group. Switching groups jumps
  // to the group's first tab.
  const group = groupForTab(state.compareTab);
  const groupItems = COMPARE_GROUPS.map((g) => ({ value: g.id, label: g.label }));
  const tabItems = tabsInGroup(group).map((v) => ({ value: v, label: labelForTab(v) }));
  const body = (
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
  );
  // 13f2: inside the drawer section the card chrome goes (no nested
  // cards); the standalone overlay (chat) keeps it.
  if (bare) return <div className="ui-compare-bare">{body}</div>;
  return (
    <div className="ui-compare overlay">
      <Card>{body}</Card>
    </div>
  );
}

// 18: removed — the judgment counts now read as plain language in
// howCalculatedLines (no internal "고른 주체" line reaches customers).

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
          {state.mode === "sim" && (
            <VStack gap={1}>
              <Text type="supporting">하루 색깔</Text>
              <ActivityLegend />
            </VStack>
          )}
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
        <SimDrawer state={state} />
        {legendOpen && <LegendCard state={state} onClose={closeLegend} />}
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
