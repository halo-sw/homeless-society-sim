// Shareable result card (React, Astryx Dialog): one PNG (canvas, local
// download) and a printable page. Persona, A vs B (and C) in plain
// words, each number with source badges and 가정값 marks, the customer's
// own priorities, date and the disclaimer. No verdict; the file stays in
// the browser (no upload).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { store, selectShareOpen } from "./store.js";
import { resultCardData, renderShareCard, shareSourceKo } from "./share.js";

function CardPreview({ data }) {
  return (
    <VStack gap={2}>
      <Text type="supporting">{`${data.date} · ${data.scenario}`}</Text>
      {data.homes.map((h) => (
        <VStack gap={1} key={h.label}>
          <Heading level={4}>{`홈 ${h.label} · ${h.complex_name} (${h.tenure})`}</Heading>
          <MetadataList>
            {h.rows.map((r, i) => (
              <MetadataListItem key={i} label={r.label}>
                <VStack gap={1}>
                  <Text hasTabularNumbers>{r.value}</Text>
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    {r.sources.map((s) => (
                      <Badge key={s} variant="neutral" label={shareSourceKo(s)} />
                    ))}
                    {r.assumed && <Badge variant="yellow" label="가정값" />}
                  </HStack>
                  {r.note && <Text type="supporting">{r.note}</Text>}
                </VStack>
              </MetadataListItem>
            ))}
          </MetadataList>
        </VStack>
      ))}
      <VStack gap={1}>
        <Heading level={4}>내가 정한 비중</Heading>
        {data.priorities.lines.map((l, i) => (
          <Text key={i} type="supporting">{l}</Text>
        ))}
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
  const canvasRef = useRef(null);
  const [pngUrl, setPngUrl] = useState("");
  const [pngError, setPngError] = useState("");
  const data = useMemo(() => {
    const s = store.getState();
    return resultCardData({
      money: s.money && !s.money.error ? s.money : null,
      tenures: s.moneyTenure, priorities: s.priorities,
      weights: s.priorityWeights, scenarioName: s.scenarioName,
    });
  }, [open]);

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
        width={560} maxHeight="85dvh" purpose="info">
        <DialogHeader title="결과 공유" onOpenChange={(v) => store.set({ shareOpen: v })} />
        <VStack gap={2}>
          <div className="ui-share-scroll">
            <CardPreview data={data} />
          </div>
          <canvas ref={canvasRef} className="ui-share-canvas" aria-hidden="true" />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button size="sm" label="PNG 저장" onClick={makePng} />
            {pngUrl && (
              <a href={pngUrl} download={`우리집-비교-${data.date}.png`}>PNG 내려받기</a>
            )}
            <Button size="sm" variant="secondary" label="인쇄" onClick={print} />
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
