// Shareable result card (React, Astryx Dialog): one PNG (canvas, local
// download) and a printable page. Header (persona or household, homes A
// / B with area, 만든 날 vs 시뮬레이션 기간), the 내 기준 점수 first,
// twelve A-vs-B rows in plain words — each number with source badges
// and 가정값 marks, the lower side marked neutrally (낮음, never
// 좋음/나쁨) — the customer's own priorities as small bars, and the
// disclaimer. No verdict; the file stays in the browser (no upload).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { store, selectShareData, selectShareOpen } from "./store.js";
import { PRIORITY_GROUPS } from "../priorities.js";
import { resultCardData, renderShareCard, requestShareLoads,
  shareLoadPlan, shareSourceKo } from "./share.js";

function todayISO() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function CardPreview({ data }) {
  const who = [data.persona, data.household].filter(Boolean).join(" · ");
  return (
    <VStack gap={2}>
      {who && <Text>{who}</Text>}
      {data.homes.map((h) => (
        <Text key={h.label} hasTabularNumbers>{h.headline}</Text>
      ))}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="supporting">{`만든 날 ${data.createdDay}`}</Text>
        <Text type="supporting">{data.simPeriod.label}</Text>
      </HStack>
      {data.score && (
        <VStack gap={1}>
          <Text hasTabularNumbers>
            {`내 기준 점수 ${Object.entries(data.score.scores)
              .map(([l, v]) => `${l} ${v === null || v === undefined ? "–" : v}`).join(" · ")}`}
          </Text>
          <Text type="supporting">{data.score.caption}</Text>
        </VStack>
      )}
      <div className="ui-share-rows" role="table" aria-label="A·B 비교">
        <div className="ui-share-row ui-share-head" role="row">
          <span role="columnheader">항목</span>
          <span role="columnheader">A</span>
          <span role="columnheader">B</span>
        </div>
        {data.rows.map((r) => (
          <div className="ui-share-row" role="row" key={r.id}>
            <span role="cell">
              <Text>{r.label}</Text>
              <Text type="supporting">
                {`출처: ${[...r.sources.map(shareSourceKo), ...(r.assumed ? ["가정값"] : [])].join(" · ")}`}
              </Text>
              {r.note && <Text type="supporting">{r.note}</Text>}
            </span>
            <span role="cell">
              <Text hasTabularNumbers>{r.lowerSide === "A" ? `${r.a} (낮음)` : r.a}</Text>
            </span>
            <span role="cell">
              <Text hasTabularNumbers>{r.lowerSide === "B" ? `${r.b} (낮음)` : r.b}</Text>
            </span>
          </div>
        ))}
      </div>
      <VStack gap={1}>
        <Heading level={4}>내가 정한 비중</Heading>
        {data.priorities.bars.length > 0 ? (
          data.priorities.bars.map((b) => (
            <ProgressBar key={b.title} label={b.title} value={b.weight} max={5}
              isLabelHidden={false} />
          ))
        ) : (
          data.priorities.lines.map((l, i) => (
            <Text key={i} type="supporting">{l}</Text>
          ))
        )}
        <Text type="supporting">{data.priorities.note}</Text>
      </VStack>
      <Text type="supporting">{data.disclaimer}</Text>
      <Text type="supporting">{data.sources_note}</Text>
    </VStack>
  );
}

export function ShareDialog() {
  const open = useSyncExternalStore(store.subscribe,
    () => selectShareOpen(store.getState()), () => selectShareOpen(store.getState()));
  // The full share snapshot (stable selector): the card re-renders when
  // the docs arrive, not just when the dialog opens.
  const snap = useSyncExternalStore(store.subscribe,
    () => selectShareData(store.getState()), () => selectShareData(store.getState()));
  const canvasRef = useRef(null);
  const [pngUrl, setPngUrl] = useState("");
  const [pngError, setPngError] = useState("");
  // Opening the dialog (or landing on the tour's share step) ensures
  // both docs are loaded even when the A·B 비교 tab never opened.
  useEffect(() => {
    if (open) requestShareLoads(store);
  }, [open]);
  const plan = shareLoadPlan(snap);
  const data = useMemo(() => {
    const simMeta = snap.simMeta || {};
    const members = Array.isArray(simMeta.members) ? simMeta.members.join(" · ") : "";
    return resultCardData({
      money: snap.money && !snap.money.error ? snap.money : null,
      compare: snap.compare && !snap.compare.error ? snap.compare : null,
      tenures: snap.moneyTenure,
      priorities: { groups: PRIORITY_GROUPS.map((g) => ({ id: g.id, title: g.title })) },
      weights: snap.priorityWeights, scenarioName: snap.scenarioName,
      householdLine: members,
      simStart: simMeta.startDate || "",
      simDays: simMeta.days || 0,
      date: todayISO(),
    });
  }, [open, snap]);

  const makePng = () => {
    setPngError("");
    setPngUrl("");
    try {
      const canvas = canvasRef.current || document.createElement("canvas");
      renderShareCard(canvas, data);
      setPngUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      setPngError(`그림을 만들지 못했어요: ${err.message}`);
    }
  };

  useEffect(() => {
    const done = () => document.body.classList.remove("printing-share");
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  const print = () => {
    try {
      document.body.classList.add("printing-share");
      window.print();
    } catch {
      document.body.classList.remove("printing-share");
    }
  };

  return (
    <>
      <Dialog isOpen={open} onOpenChange={(v) => store.set({ shareOpen: v })}
        width={640} maxHeight="85dvh" purpose="info">
        <DialogHeader title="결과 공유" onOpenChange={(v) => store.set({ shareOpen: v })} />
        <VStack gap={2}>
          <div className="ui-share-scroll">
            {plan.loading ? (
              <Text type="supporting">비교 숫자 불러오는 중…</Text>
            ) : (
              <CardPreview data={data} />
            )}
          </div>
          <canvas ref={canvasRef} className="ui-share-canvas" aria-hidden="true" />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button size="sm" label="PNG 저장" onClick={makePng} isDisabled={plan.loading} />
            {pngUrl && (
              <a href={pngUrl} download={`우리집-비교-${data.date}.png`}>PNG 내려받기</a>
            )}
            <Button size="sm" variant="secondary" label="인쇄" onClick={print}
              isDisabled={plan.loading} />
            <Button size="sm" variant="ghost" label="닫기"
              onClick={() => store.set({ shareOpen: false })} />
          </HStack>
          {pngError && <Text>{pngError}</Text>}
          <Text type="supporting">파일은 이 브라우저에만 저장돼요. 어디에도 올리지 않아요.</Text>
        </VStack>
      </Dialog>
      {/* Printable page: portalled out of #app so print CSS can isolate it. */}
      {typeof document !== "undefined" && createPortal(
        <div id="share-print" aria-hidden="true">
          <CardPreview data={data} />
        </div>,
        document.body,
      )}
    </>
  );
}
