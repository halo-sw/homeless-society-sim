// "시뮬레이션 상담" docked right panel: Astryx Chat in a plain Card.
//
// Stage 6: no Drawer — the panel docks right of the canvas (via a portal
// into #panel-root) and shrinks it, so it never covers the 3D view, the
// followed resident or the caption. Open on first visit, a slim tab after
// that (the TopBar 상담 toggle reopens). Ditching the Drawer also removes
// the stuck Close tooltip and the showPopover console error.
//
// Dev: live agent over POST /api/consult (key on the dev server only).
// Production: a notice plus the recorded demo transcript
// (scenarios/consult-demo.json; empty state when absent). Conversations
// live in browser memory only; the server stores nothing.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import {
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble,
  ChatComposer, ChatToolCalls,
} from "@astryxdesign/core/Chat";
import { store } from "./store.js";
import { postConsult, loadScenario, loadDemoTranscript, formatUsage } from "./consult-client.js";

const IS_DEV = import.meta.env.DEV;

const GREETING = [
  "안녕하세요! 생활 시뮬레이션 상담입니다.",
  "먼저 누구와 사시는지 알려주세요. (예: 성인 2명)",
  "연봉과 보유 현금을 알려주시면 월 생활비도 시뮬레이션해 드립니다.",
].join("\n");

const PROVIDER_BADGE = { meta: "Muse Spark 1.3", baseten: "Muse Spark Open" };

function ToolRows({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <ChatToolCalls calls={rows.map((r) => ({
        key: r.id,
        name: r.name,
        status: r.ok ? "complete" : "error",
        target: r.summary,
        duration: `${r.ms}ms`,
      }))} />
    </ChatMessageBubble>
  );
}

function AssistantMsg({ msg, toolRows }) {
  const rows = (msg.tool_calls || []).map((c) => toolRows[c.id]).filter(Boolean);
  if (!msg.content && rows.length === 0) return null;
  return (
    <ChatMessage sender="assistant">
      {msg.content && (
        <ChatMessageBubble variant="ghost">
          <Markdown>{msg.content}</Markdown>
        </ChatMessageBubble>
      )}
      <ToolRows rows={rows} />
    </ChatMessage>
  );
}

// Merge agent money results into the store so the 생활비 tab can show
// home C and the "C로 추가" candidates. Pure over the message list.
function mergeMoneyResults(messages) {
  for (const m of messages || []) {
    if (!m || m.role !== "tool" || typeof m.content !== "string") continue;
    let r = null;
    try {
      r = JSON.parse(m.content);
    } catch {
      continue;
    }
    if (!r || r.ok !== true) continue;
    if (r.timeline && r.housing && r.home) {
      const prev = store.getState().money;
      const doc = prev && !prev.error ? structuredClone(prev) : { homes: {} };
      doc.homes = doc.homes || {};
      const slot = doc.homes[r.home] || { by_tenure: {} };
      slot.by_tenure = slot.by_tenure || {};
      slot.by_tenure[r.tenure] = {
        housing: r.housing,
        totals_by_category: r.timeline.totals_by_category,
        monthly_spent_won: r.timeline.monthly_spent_won,
        remaining_won: r.timeline.remaining_won,
        burden_ratio: r.timeline.burden_ratio,
        counts: r.timeline.counts,
        daily_balance_won: r.timeline.daily_balance_won,
        payday_note: r.timeline.payday_note,
      };
      slot.area_m2 = slot.area_m2 ?? (r.price_inputs && r.price_inputs.area_m2) ?? null;
      if (r.monthly_net_won && !doc.household_monthly_net_won) {
        doc.household_monthly_net_won = r.monthly_net_won;
      }
      doc.homes[r.home] = slot;
      store.set({ money: doc,
        moneyTenure: { ...store.getState().moneyTenure, [r.home]: r.tenure } });
    } else if (Array.isArray(r.candidates)) {
      store.set({ moneyCandidates: r.candidates });
    }
  }
}

function LiveChat({ scenarioName, pending, onConsumed }) {
  const [history, setHistory] = useState([{ role: "assistant", content: GREETING }]);
  const [toolRows, setToolRows] = useState({});
  const [scenario, setScenario] = useState(null);
  const [provider, setProvider] = useState("meta");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState({ prompt_tokens: 0, completion_tokens: 0, est_usd: 0 });
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadScenario(scenarioName)
      .then((s) => { if (!cancelled) setScenario(s); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [scenarioName]);

  async function send(text) {
    const content = String(text || "").trim();
    if (!content || busyRef.current) return;
    if (!scenario) {
      setError("시나리오를 아직 불러오는 중입니다. 잠시 후 다시 보내주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const next = [...history, { role: "user", content }];
    setHistory(next);
    try {
      const out = await postConsult({ provider, messages: next, scenario });
      const rows = { ...toolRows };
      const callIds = [];
      for (const m of out.messages) {
        for (const c of m.tool_calls || []) callIds.push(c.id);
      }
      (out.toolCalls || []).forEach((t, i) => {
        if (callIds[i]) rows[callIds[i]] = { id: callIds[i], ...t };
      });
      setToolRows(rows);
      setHistory([...next, ...out.messages]);
      mergeMoneyResults(out.messages);
      if (out.scenario) setScenario(out.scenario);
      setUsage((u) => ({
        prompt_tokens: u.prompt_tokens + ((out.usage && out.usage.prompt_tokens) || 0),
        completion_tokens: u.completion_tokens + ((out.usage && out.usage.completion_tokens) || 0),
        est_usd: u.est_usd + ((out.usage && out.usage.est_usd) || 0),
      }));
      if (out.view) {
        try {
          store.act("applyView", out.view);
        } catch { /* scene not ready (tour boot): chip still shows */ }
        store.set({ viewChip: out.view.chip || "화면 이동" });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // "C로 추가" from the money tab: send once the scenario is ready.
  const pendingRef = useRef(null);
  useEffect(() => {
    if (pending && pending !== pendingRef.current && scenario && !busyRef.current) {
      pendingRef.current = pending;
      send(pending.text);
      if (onConsumed) onConsumed();
    }
  });

  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center">
        <SegmentedControl label="상담 제공자" value={provider} onChange={setProvider} size="sm">
          <SegmentedControlItem value="meta" label="Spark 1.3" />
          <SegmentedControlItem value="baseten" label="Spark Open" />
        </SegmentedControl>
        <Badge variant="blue" label={PROVIDER_BADGE[provider]} />
      </HStack>
      <div className="ui-consult-meta">
        <Text type="supporting">대화는 이 브라우저에만 저장됩니다</Text>
        <Text type="supporting" hasTabularNumbers>{formatUsage(usage)}</Text>
      </div>
      {error && (
        <Banner status="error" title="상담 요청 실패" description={error}
          isDismissable onDismiss={() => setError("")} />
      )}
      <ChatLayout density="compact"
        composer={<ChatComposer onSubmit={send} isDisabled={busy}
          placeholder={busy ? "답변 생성 중…" : "시뮬레이션에 대해 물어보세요…"} />}>
        <ChatMessageList density="compact">
          {history.map((m, i) => (m.role === "user" ? (
            <ChatMessage key={i} sender="user">
              <ChatMessageBubble>{m.content}</ChatMessageBubble>
            </ChatMessage>
          ) : m.role === "assistant" ? (
            <AssistantMsg key={i} msg={m} toolRows={toolRows} />
          ) : null))}
          {busy && (
            <ChatMessage sender="assistant">
              <ChatMessageBubble variant="ghost">
                <Text type="supporting">생각 중…</Text>
              </ChatMessageBubble>
            </ChatMessage>
          )}
        </ChatMessageList>
      </ChatLayout>
    </VStack>
  );
}

function DemoTranscript() {
  const [doc, setDoc] = useState(undefined); // undefined = loading
  useEffect(() => {
    let cancelled = false;
    loadDemoTranscript().then((d) => { if (!cancelled) setDoc(d); });
    return () => { cancelled = true; };
  }, []);
  if (doc === undefined) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || !Array.isArray(doc.messages) || doc.messages.length === 0) {
    return (
      <EmptyState isCompact title="아직 데모 대화가 없습니다"
        description="로컬 개발 서버에서 Muse 키로 상담을 실행하면 여기에 기록이 표시됩니다." />
    );
  }
  return (
    <ChatMessageList density="compact">
      {doc.messages.map((m, i) => (m.role === "user" ? (
        <ChatMessage key={i} sender="user">
          <ChatMessageBubble>{m.text}</ChatMessageBubble>
        </ChatMessage>
      ) : (
        <ChatMessage key={i} sender="assistant">
          {m.text && (
            <ChatMessageBubble variant="ghost">
              <Markdown>{m.text}</Markdown>
            </ChatMessageBubble>
          )}
          <ToolRows rows={(m.toolCalls || []).map((t, k) => ({
            id: `${i}-${k}`, name: t.name, ok: t.ok !== false,
            summary: t.summary || "", ms: t.ms || 0,
          }))} />
        </ChatMessage>
      )))}
    </ChatMessageList>
  );
}

export function ConsultPanel() {
  const consultOpen = useSyncExternalStore(store.subscribe,
    () => store.getState().consultOpen, () => store.getState().consultOpen);
  const scenarioName = useSyncExternalStore(store.subscribe,
    () => store.getState().scenarioName, () => store.getState().scenarioName);
  const [pending, setPending] = useState(null);
  const setOpen = (next) => store.set({ consultOpen: next });

  useEffect(() => {
    const root = document.getElementById("panel-root");
    if (root) root.dataset.state = consultOpen ? "open" : "tab";
  }, [consultOpen]);

  // The money tab's "C로 추가" sends through the agent (server tools own
  // the scenario + housing lookups). Opens the panel and queues the text.
  useEffect(() => {
    store.registerActions({
      consultSend: (text) => {
        setPending({ text: String(text || ""), at: Date.now() });
        store.set({ consultOpen: true });
      },
    });
  }, []);

  const host = typeof document === "undefined" ? null : document.getElementById("panel-root");
  if (!host) return null;
  return createPortal(
    consultOpen ? (
      <div className="ui-panel">
        <Card>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center">
              <VStack gap={0}>
                <Heading level={4}>시뮬레이션 상담</Heading>
                <Text type="supporting">조건 정하기 · 결과 설명 · 다시 실행</Text>
              </VStack>
              <span className="ui-panel-spacer" />
              <Button size="sm" variant="ghost" label="접기"
                onClick={() => setOpen(false)} />
            </HStack>
            <div className="ui-consult-chat">
              {IS_DEV ? (
                <LiveChat scenarioName={scenarioName} pending={pending}
                  onConsumed={() => setPending(null)} />
              ) : (
                <VStack gap={2}>
                  <Banner status="info" title="상담은 로컬 개발 서버에서 Muse 키로 동작합니다" />
                  <DemoTranscript />
                </VStack>
              )}
            </div>
          </VStack>
        </Card>
      </div>
    ) : (
      <div className="ui-paneltab">
        <Button size="sm" variant="secondary" label="상담"
          onClick={() => setOpen(true)} />
      </div>
    ),
    host,
  );
}

// Back-compat alias (tests / older call sites).
export const ConsultDrawer = ConsultPanel;
