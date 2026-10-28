// Guided demo tour bar (React, Astryx Stepper): caption, progress,
// deterministic auto-advance, pause, next and skip. Steps navigate by URL
// (fresh boot per step — deterministic for screen recording).
import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { Text } from "@astryxdesign/core/Text";
import { DEMO_TOUR_STEPS, tourStepFromSearch, tourStepUrl,
  tourSkipUrl, DEMO_TOUR_TOTAL_SECS } from "./demotour.js";

const TICK_MS = 250;

export function DemoTour() {
  const found = typeof window === "undefined" ? null
    : tourStepFromSearch(window.location.search);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!found || paused) return undefined;
    const id = setInterval(() => setElapsed((e) => e + TICK_MS / 1000), TICK_MS);
    return () => clearInterval(id);
  }, [found ? found.index : -1, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!found) return null;
  const { index, step } = found;
  const last = index >= DEMO_TOUR_STEPS.length - 1;
  const go = (i) => {
    window.location.href = tourStepUrl(i, window.location.search);
  };
  if (!paused && !last && elapsed >= step.secs) {
    go(index + 1);
    return null;
  }
  const left = Math.max(0, Math.ceil(step.secs - elapsed));
  return (
    <div className="ui-tour overlay">
      <VStack gap={1}>
        <HStack gap={2} vAlign="center">
          <Heading level={4}>3분 둘러보기</Heading>
          <Text type="supporting">{`${index + 1} / ${DEMO_TOUR_STEPS.length} · 전체 ${DEMO_TOUR_TOTAL_SECS}초`}</Text>
          <span className="ui-panel-spacer" />
          <Button size="sm" variant="ghost" label={paused ? "계속" : "일시정지"}
            onClick={() => setPaused(!paused)} />
          {!last && (
            <Button size="sm" variant="secondary" label={`다음 (${left}초)`}
              onClick={() => go(index + 1)} />
          )}
          <Button size="sm" variant="ghost" label="건너뛰기"
            onClick={() => { window.location.href = tourSkipUrl(window.location.search); }} />
        </HStack>
        <Text>{step.caption}</Text>
        <Stepper activeStep={index} density="compact" label="둘러보기 단계"
          onStepClick={(i) => go(i)}>
          {DEMO_TOUR_STEPS.map((s, i) => (
            <Step key={s.id} step={i} label={s.caption} />
          ))}
        </Stepper>
      </VStack>
    </div>
  );
}
