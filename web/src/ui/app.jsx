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
import { MoneyTab, QualityTab } from "./money.jsx";
import { fmtMinutes, fmtDistance, fmtCount, badgeFor } from "../money/format.js";

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
          <Heading level={4}>판단 기록</Heading>
          <ol className="ui-timeline">
            {state.judgeLog.map((row, i) => (
              <li key={i} className="ui-timeline-row">
                <span className="ui-timeline-dot" aria-hidden="true" />
                <VStack gap={0}>
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    <Text type="supporting" hasTabularNumbers>{row.minute}</Text>
                    <Text type="supporting">{`${row.agent} · ${row.kind} → ${row.choice}`}</Text>
                    <Badge variant={JUDGE_BADGE[row.badgeCls] || "neutral"} label={row.badgeText} />
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

const fmtMetric = (unit, v) => (
  unit === "minutes" ? fmtMinutes(v) : unit === "metres" ? fmtDistance(v) : fmtCount(v));

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
  return (
    <div className="ui-attr">
      <div className="overlay">
        <Text type="supporting">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL) · GIS건물통합정보 (국토교통부/VWorld) · 나무·인물은 장식용 모의 표시
          {money && " · 실거래: 국토교통부 실거래가 공개시스템(참고용) · 공공임대: LH·마이홈 (공공주택 데이터 API)"}
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
      <CaptionCard state={state} />
      {isSim && <JudgeLogCard state={state} />}
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
