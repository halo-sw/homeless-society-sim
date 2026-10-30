// Day-at-a-glance timeline UI (12b, D): route steps, the day strip
// and the 30-day strip. Replaces the two sliders + dots: the scene
// publishes segments/steps/month cells once per day (timeline.js
// builders over the real run), and the playhead minute moves freely
// underneath. Keyboard: ←/→ previous/next trip, space play/pause
// (ignored while typing). Reduced motion: no auto-advance pulses —
/// the strip is direct manipulation only.
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { store } from "./store.js";
import {
  ACTIVITIES, ACTIVITY_ORDER, DAY_STRIP_START, DAY_STRIP_END,
  activityLabel, segmentTitle, stripFrac, stripMinute, hhmm,
  stepIndexAt, navFromOutings, outingIndexAt,
} from "../timeline.js";

const act = (name, ...args) => store.act(name, ...args);

// --- activity icons (tiny inline SVGs, no emoji) -------------------------------------

const ICON_PATHS = {
  home: "M2 7 L6 3 L10 7 V11 H2 Z",
  walk: "M6 2.2 a1.3 1.3 0 1 0 0.1 0 M5 5 L4 8 L6 8 L5.4 11 M6 8 L8 9 L8.6 11",
  bike: "M2.5 8.5 a1.8 1.8 0 1 0 0.1 0 M9.5 8.5 a1.8 1.8 0 1 0 0.1 0 M2.5 8.5 L5 8.5 L6.5 4.5 L9 4.5 M5 8.5 L4.5 5.5 L6.5 4.5 M6 2.5 L6.5 4.5",
  subway: "M3 2 H9 V9 H3 Z M3 6 H9 M4.5 9 L4 11 M7.5 9 L8 11",
  work: "M2.5 4 H9.5 V10 H2.5 Z M4.5 4 V3 H7.5 V4 M6 4 V10",
  errand: "M2.5 5 H9.5 L8.5 10 H3.5 Z M4 5 a2 2 0 0 1 4 0",
  park: "M6 2 L9.5 7 H2.5 Z M6 7 V11",
  other: "M3 6 h.1 M6 6 h.1 M9 6 h.1",
};

export function ActivityIcon({ activity, size = 12 }) {
  const d = ICON_PATHS[activity] || ICON_PATHS.other;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"
      strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// --- route steps -----------------------------------------------------------------------

export function RouteSteps({ route, minute, onStep, onPrev, onNext }) {
  const outings = (route && route.outings) || [];
  const at = outingIndexAt(outings, minute);
  if (at < 0) return null;
  const steps = outings[at].steps || [];
  if (steps.length === 0) return null;
  const current = stepIndexAt(steps, minute);
  const nav = navFromOutings(outings, minute);
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Button size="sm" variant="ghost" label="◀ 이전 이동"
          isDisabled={nav.prev === null}
          onClick={() => nav.prev !== null && onPrev(nav.prev)} />
        {steps.map((s, i) => (
          <span key={i} className="ui-stepwrap">
            {i > 0 && <span className="ui-step-arrow" aria-hidden="true">→</span>}
            <Button size="sm" variant={i === current ? "secondary" : "ghost"}
              label={s.label} onClick={() => onStep(s.minute)} />
          </span>
        ))}
        <Button size="sm" variant="ghost" label="다음 이동 ▶"
          isDisabled={nav.next === null}
          onClick={() => nav.next !== null && onNext(nav.next)} />
      </HStack>
    </VStack>
  );
}

// --- day strip ----------------------------------------------------------------------------

function Ticks({ ticks }) {
  if (!ticks || ticks.length === 0) return null;
  return (
    <>
      {ticks.filter((t) => t.minute >= DAY_STRIP_START && t.minute <= DAY_STRIP_END)
        .map((t, i) => (
          <button key={`${t.kind}-${t.minute}-${i}`}
            className={`ui-tick ui-tick-${t.kind} ui-strip-tick`}
            style={{ left: `${(stripFrac(t.minute) * 100).toFixed(2)}%` }}
            title={`${hhmm(t.minute)} ${t.kind === "decision" ? "고른 순간" : "출발"}`}
            aria-label={`${hhmm(t.minute)} ${t.kind === "decision" ? "고른 순간" : "출발"}로 이동`}
            onClick={(e) => { e.stopPropagation(); act("setMinute", t.minute); }} />
        ))}
    </>
  );
}

export function DayStrip({ segments, ticks, minute, label, onJump, bare }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const jumpFromClientX = (clientX) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    onJump(stripMinute((clientX - r.left) / r.width));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const move = (e) => {
      if (dragging.current) jumpFromClientX(e.clientX);
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every segment keeps its hover tooltip ("08:21–08:35 걷기 · …"):
  // the leg for that time is one hover away.
  const strip = (
    <div className="ui-strip" role="group" aria-label={label || "하루 막대"}
      ref={ref}
      onPointerDown={(e) => {
        if (e.target.closest("button")) return;
        dragging.current = true;
        jumpFromClientX(e.clientX);
      }}>
      {(segments || []).map((s, i) => (
        <button key={i}
          className="ui-strip-seg"
          style={{
            left: `${(stripFrac(s.start) * 100).toFixed(2)}%`,
            width: `${Math.max(0.4, (stripFrac(s.end) - stripFrac(s.start)) * 100).toFixed(2)}%`,
            background: (ACTIVITIES[s.activity] || ACTIVITIES.other).color,
          }}
          title={segmentTitle(s)}
          aria-label={`${segmentTitle(s)}로 이동`}
          onClick={() => onJump(s.start)} />
      ))}
      <Ticks ticks={ticks} />
      <div className="ui-strip-head" aria-hidden="true"
        style={{ left: `${(stripFrac(minute) * 100).toFixed(2)}%` }} />
    </div>
  );
  // 13f2: the one-row bar embeds the strip with no captions.
  if (bare) return strip;
  return (
    <VStack gap={0}>
      {label && <Text type="supporting">{label}</Text>}
      {strip}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="supporting" hasTabularNumbers>05:00</Text>
        <span className="ui-panel-spacer" />
        <Text type="supporting" hasTabularNumbers>24:00</Text>
      </HStack>
    </VStack>
  );
}

export function ActivityLegend({ hasBike = false }) {
  const order = hasBike ? [...ACTIVITY_ORDER, "bike"] : ACTIVITY_ORDER;
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {order.map((a) => (
        <HStack key={a} gap={1} vAlign="center">
          <span className="ui-swatch" style={{ background: ACTIVITIES[a].color }} aria-hidden="true" />
          <ActivityIcon activity={a} />
          <Text type="supporting">{activityLabel(a)}</Text>
        </HStack>
      ))}
    </HStack>
  );
}

// --- 30-day strip ---------------------------------------------------------------------------

export function MonthStrip({ days, selected, onDay }) {
  const list = days || [];
  if (list.length === 0) return null;
  const max = Math.max(1, ...list.map((d) => d.commuteMin || 0));
  return (
    <div className="ui-month" role="group" aria-label="30일 고르기">
      {list.map((d) => {
        const h = d.commuteMin === null ? 2 : 2 + Math.round((d.commuteMin / max) * 14);
        const title = `${d.day + 1}일차 ${d.date} (${d.weekday}) · `
          + `출퇴근 ${d.commuteMin === null ? "기록 없음" : `${d.commuteMin}분`} · `
          + `평균 피곤한 정도 ${d.fatigueMean === null ? "기록 없음" : d.fatigueMean}`;
        return (
          <button key={d.day}
            className={`ui-month-cell${d.day === selected ? " ui-month-sel" : ""}${d.weekend ? " ui-month-wk" : ""}`}
            title={title} aria-label={title}
            aria-pressed={d.day === selected}
            onClick={() => onDay(d.day)}>
            <span className="ui-month-bar" style={{ height: h }} aria-hidden="true" />
            <span className="ui-month-num" aria-hidden="true">{d.day + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- the bar (replaces the sliders) --------------------------------------------------------------

function SegControl({ label, value, onChange, items, size }) {
  return (
    <SegmentedControl label={label} value={value} onChange={onChange} size={size || "sm"}>
      {items.map((it) => (
        <SegmentedControlItem key={it.value} value={it.value} label={it.label} />
      ))}
    </SegmentedControl>
  );
}

// Keyboard: ←/→ trip hop, space play/pause. Never while typing.
// Pure over injected getters (tested); the bar wires the store.
export function timelineKeyHandler({ routeOutings, minute, togglePlay, setMinute }) {
  return (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
        || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.code === "Space") {
      if (e.preventDefault) e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const outs = typeof routeOutings === "function" ? routeOutings() : routeOutings;
      const nav = navFromOutings(outs, minute());
      const to = e.key === "ArrowLeft" ? nav.prev : nav.next;
      if (to !== null && to !== undefined) {
        if (e.preventDefault) e.preventDefault();
        setMinute(to);
      }
    }
  };
}

// 13f2: one row, ≤64px — play, clock, the strip (flex 1, needle),
// speed, and a ⋯ menu. Route steps moved to the drawer's 오늘 list
// (hovering the strip still shows each leg); the legend moved to the
// map tool group's 범례; the month strip opens from the menu.
function PlayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
      <path d="M3 1.5 L10 6 L3 10.5 Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
      <path d="M2.6 2 H5 V10 H2.6 Z M7 2 H9.4 V10 H7 Z" />
    </svg>
  );
}

export function TimelineBar({ state, compact = true, defaultMenuOpen = false }) {
  const { clock } = state;
  const minute = Math.floor(clock.minute);
  const day = clock.day;
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [showMonth, setShowMonth] = useState(!compact);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = timelineKeyHandler({
      routeOutings: () => {
        const r = store.getState().routeSteps;
        return r && r.outings;
      },
      minute: () => store.getState().clock.minute,
      togglePlay: () => act("toggleSimPlay"),
      setMinute: (m) => act("setMinute", m),
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const jump = (m) => act("setMinute", Math.max(0, Math.min(1439, Math.round(m))));
  return (
    <div className="ui-simbar overlay">
      <Card padding={2}>
        <div className="ui-bar13f2">
          <div className="ui-bar13f2-row">
            <IconButton label={state.playing ? "일시정지" : "재생"} size="sm" variant="ghost"
              icon={state.playing ? <PauseGlyph /> : <PlayGlyph />}
              onClick={() => act("toggleSimPlay")} />
            <Text hasTabularNumbers>{clock.label}</Text>
            <div className="ui-bar13f2-strip">
              <DayStrip bare segments={state.dayStrip && state.dayStrip.segments}
                ticks={state.simTicks} minute={minute} onJump={jump} />
            </div>
            <SegControl label="재생 속도" value={String(state.speed)}
              onChange={(v) => act("setSpeed", Number(v))}
              items={[{ value: "1", label: "1×" }, { value: "10", label: "10×" }, { value: "60", label: "60×" }]} />
            <IconButton label="더 보기" size="sm" variant={menuOpen ? "secondary" : "ghost"}
              icon={<Icon icon="moreHorizontal" />}
              onClick={() => setMenuOpen(!menuOpen)} />
          </div>
          <div className="ui-strip-legend">
            <ActivityLegend hasBike={!!(state.dayStrip && state.dayStrip.hasBike)} />
          </div>
          {menuOpen && (
            <div className="ui-bar13f2-menu">
              <Button size="sm" label="A·B 비교" variant="secondary"
                onClick={() => act("toggleCompare")} />
              <ToggleButton size="sm" label="A·B 하루 같이 보기" isPressed={!!state.stripCompare}
                onPressedChange={() => act("toggleStripCompare")} />
              <ToggleButton size="sm" label="30일 보기" isPressed={showMonth}
                onPressedChange={() => setShowMonth(!showMonth)} />
              <SegControl label="따라가기" value={String(state.follow)}
                onChange={(v) => act("setFollow", Number(v))}
                items={state.followOptions} />
            </div>
          )}
          {state.stripCompare && state.dayStripB && (
            <DayStrip segments={state.dayStripB.segments} ticks={[]}
              minute={minute} label={`${state.dayStripB.home} · 같은 시각`}
              onJump={jump} />
          )}
          <div hidden={!showMonth}>
            <MonthStrip days={state.monthStrip} selected={day}
              onDay={(d) => act("setDay", d)} />
          </div>
        </div>
      </Card>
    </div>
  );
}
