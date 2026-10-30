// One top bar for chat / sim / tour (13f-1). Left: product name +
// mode switch. Centre: profile summary chip (chat only). Right: one
// 설정 button opening a right sheet with everything else (model,
// 가정, sources, intro, restart). Sim/tour view options live in a
// small floating MapTools group instead. SSR-safe (no window at
// render; navigation only in handlers).
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Drawer } from "@astryxdesign/core/Drawer";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { store } from "./store.js";
import { LIVE_API, appUrl } from "../paths.js";
import { ModelPanel } from "./model-panel.jsx";
import { SourcesDrawer } from "./sources.jsx";
import { AssumptionsPanel } from "./assumptions.jsx";
import { newUsageLog } from "../models/catalog.js";
import { LangToggle } from "./lang-toggle.jsx";

const EMPTY_LOG = newUsageLog();

export function museStatusLabel(live) {
  return live ? "연결됨 · Muse Spark 1.3" : "규칙 모드";
}

const DEFAULT_AREA = "songpa-jamsil";

export function gotoMode(mode, current) {
  if (!mode || mode === current) return;
  if (typeof window === "undefined") return;
  try {
    if (current !== "chat") {
      if (mode === "chat" && store.hasAction("openChat")) {
        store.act("openChat");
        return;
      }
      if (mode !== "chat" && store.hasAction("selectMode")) {
        store.act("selectMode", mode);
        return;
      }
    }
  } catch {
    /* fall through to plain navigation */
  }
  const areaId = (store.getState().area && store.getState().area.id) || DEFAULT_AREA;
  window.location.href = mode === "chat" ? appUrl("chat=")
    : mode === "sim" ? appUrl("mode=sim&home=A") : appUrl(`area=${areaId}`);
}

function IntroStatic() {
  return (
    <VStack gap={1}>
      <Text>부동산 결정, 혼자 알아보기 어렵죠. 살아 보고, 돈 계산해 보고, 전세 신호를 확인하고, 도움 제도를 보고 직접 결정하세요.</Text>
      <Text type="supporting">정하지 않는 것: 집값이 오를지, 돈을 빌릴 수 있는지, 입주 자격, 살지 말지.</Text>
    </VStack>
  );
}

export function SettingsContent({ settings, onClose }) {
  const s = settings || {};
  const model = s.model || {};
  const assume = s.assumptions || null;
  return (
    <div className="ui-sheet-body">
      <HStack gap={1} vAlign="center">
        <Heading level={3}>설정</Heading>
        <span className="ui-panel-spacer" />
        <Button size="sm" variant="ghost" label="닫기" onClick={onClose} />
      </HStack>
      <VStack gap={1}>
        <Heading level={4}>모델</Heading>
        {s.modelExtra}
        <ModelPanel usageLog={model.usageLog || EMPTY_LOG}
          serverKeys={model.serverKeys || {}} errors={model.errors || {}} />
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>가정 바꾸기</Heading>
        {assume ? (
          <AssumptionsPanel overrides={assume.overrides}
            onSet={assume.onSet} onReset={assume.onReset} />
        ) : (
          <>
            <Text type="supporting">대화에서 가정을 바꾸면 다음 살아 보기에 적용돼요.</Text>
            <HStack gap={1}>
              <Button size="sm" variant="secondary" label="대화로 이동"
                onClick={() => gotoMode("chat", s.mode || "sim")} />
            </HStack>
          </>
        )}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>출처·라이선스</Heading>
        <SourcesDrawer />
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>이 시뮬레이션은?</Heading>
        <IntroStatic />
        {s.onIntro && (
          <HStack gap={1}>
            <Button size="sm" variant="secondary" label="지금 시뮬레이션 자세히"
              onClick={() => { onClose(); s.onIntro(); }} />
          </HStack>
        )}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>새로 시작</Heading>
        <Text type="supporting">처음 화면으로 돌아가요.</Text>
        <HStack gap={1}>
          <Button size="sm" variant="secondary" label="새로 시작"
            onClick={() => s.onRestart && s.onRestart()} />
        </HStack>
      </VStack>
    </div>
  );
}

export function TopBar({ mode, summary, extra, settings }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="ui-bar overlay">
      <div className="ui-bar-left">
        <span className="ui-bar-title">Ithaca</span>
        {mode === "chat" ? (
          <>
            <span className="ui-bar-muse">Muse</span>
            <Badge variant="info" label={museStatusLabel(LIVE_API)} />
          </>
        ) : (
          <Button size="sm" variant="ghost" label="← 대화로"
            onClick={() => gotoMode("chat", mode)} />
        )}
      </div>
      <div className="ui-bar-center">
        {mode === "chat" && (summary
          ? <Badge variant="info" label={summary} />
          : <Text type="supporting">상황을 알려주세요</Text>)}
      </div>
      <div className="ui-bar-right">
        {extra}
        <LangToggle />
        <IconButton label="설정" variant="ghost" size="sm"
          icon={<Icon icon="wrench" />} onClick={() => setOpen(true)} />
      </div>
      {open && (
        <Drawer isOpen onOpenChange={(v) => { if (!v) close(); }}
          side="end" label="설정" width={400}>
          <SettingsContent settings={settings} onClose={close} />
        </Drawer>
      )}
    </header>
  );
}

// Sim/tour view options, floating at the map's top-left.
export function MapTools({ state, legendOpen, onLegend }) {
  const isSim = state.mode === "sim";
  return (
    <div className="ui-tools overlay">
      {isSim ? (
        <>
          <SegmentedControl label="홈 선택" value={state.home}
            onChange={(v) => store.act("selectHome", v)} size="sm">
            {state.homes.map((h) => (
              <SegmentedControlItem key={h.label} value={h.label} label={h.label} />
            ))}
          </SegmentedControl>
          <ToggleButton size="sm" label="집만 밝게 보기" isPressed={state.resOnly}
            onPressedChange={(next) => store.act("setResOnly", next)} />
        </>
      ) : (
        <>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">지역</Text>
            <Selector label="지역" isLabelHidden value={state.area.id}
              onChange={(v) => store.act("selectArea", v)}
              options={state.areaOptions} hasSearch size="sm" />
          </HStack>
          <Button size="sm" label={state.tourPlaying ? "일시정지" : "재생"}
            onClick={() => store.act("toggleTourPlay")} />
        </>
      )}
      <Button size="sm" variant={legendOpen ? "secondary" : "ghost"}
        label="범례" onClick={onLegend} />
      {isSim && (
        <>
          <Button size="sm" variant="ghost"
            label="동네 전체" onClick={() => store.act("showOverview")} />
          <Button size="sm" variant="ghost"
            label="따라가기" onClick={() => store.act("resumeFollow")} />
        </>
      )}
    </div>
  );
}
