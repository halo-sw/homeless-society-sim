// Floating consult agent (React, Astryx): a bottom-corner FAB opens an
// anchored Popover panel (~380×560) with the Chat stack. The panel snaps
// to the bottom corner that overlaps the followed resident and the Now
// card least, minimises, and never docks — the canvas keeps full width.
//
// Dev: live agent over POST /api/consult (key on the dev server only),
// with the current view (tab, home, day, time, follow, selections)
// attached to each message so "이거" resolves. Production: a notice plus
// the recorded demo transcript (empty state when absent). Conversations
// live in browser memory only; the server stores nothing.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Citation } from "@astryxdesign/core/Citation";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { Toast } from "@astryxdesign/core/Toast";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import {
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble,
  ChatComposer, ChatToolCalls, ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { store } from "./store.js";
import { recordedReplyFor } from "./demotour.js";
import { postConsult, loadScenario, loadDemoTranscript, formatUsage } from "./consult-client.js";
import { agentContext, chipsFor, citationsFor, nextAgentCorner,
  nudgeAllowed, nudgeFor, placeAgentPanel, toolActionKo,
  viewSystemLine, AGENT_PANEL_W, AGENT_PANEL_H } from "./agent-float.js";

const IS_DEV = import.meta.env.DEV;

const GREETING = [
  "안녕하세요! 생활 시뮬레이션 상담이에요.",
  "어떤 상황이세요? 1인 사회초년생 / 예비·신혼부부 / 맞벌이 + 초등학생 자녀 / 직접 입력 중에 골라주세요.",
  "다음에는 중요하게 보는 것(교육·생활·치안·돈·생활 편의)을 정하고, 연봉과 가진 돈을 알면 한 달 생활비까지 시뮬레이션해 드려요.",
].join("\n");

const PROVIDER_BADGE = { meta: "Muse Spark 1.3", baseten: "Muse Spark Open" };

function ToolRows({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <ChatToolCalls calls={rows.map((r) => ({
        key: r.id,
        name: toolActionKo(r.name),
        status: r.ok ? "complete" : "error",
        target: r.summary,
        duration: `${r.ms}ms`,
      }))} />
    </ChatMessageBubble>
  );
}

function CiteRows({ tools }) {
  const cites = citationsFor(tools || []);
  if (cites.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <HStack gap={1} vAlign="center" wrap="wrap">
        {cites.map((c, i) => (
          <Citation key={c.title} variant="label" number={i + 1}
            source={c.url ? { title: c.title, url: c.url } : { title: c.title }} />
        ))}
      </HStack>
    </ChatMessageBubble>
  );
}

function AssistantMsg({ msg, toolRows }) {
  const rows = (msg.tool_calls || []).map((c) => toolRows[c.id]).filter(Boolean);
  const tools = (msg.tool_calls || []).map((c) => c.name);
  if (!msg.content && rows.length === 0) return null;
  return (
    <ChatMessage sender="assistant">
      {msg.recorded && (
        <ChatMessageBubble variant="ghost" width="100%">
          <Badge variant="yellow" label="기록된 답변" />
        </ChatMessageBubble>
      )}
      {msg.content && (
        <ChatMessageBubble variant="ghost">
          <Markdown>{msg.content}</Markdown>
        </ChatMessageBubble>
      )}
      <ToolRows rows={rows} />
      <CiteRows tools={tools} />
    </ChatMessage>
  );
}

function tourAskKey() {
  try {
    return new URLSearchParams(window.location.search).get("ask");
  } catch {
    return null;
  }
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
    } else if (r.listing_check === true) {
      store.set({ listingCheck: r });
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
  const compareTab = useSyncExternalStore(store.subscribe,
    () => store.getState().compareTab, () => store.getState().compareTab);
  const nudgesOn = useSyncExternalStore(store.subscribe,
    () => store.getState().agentNudges, () => store.getState().agentNudges);

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
      setError("시나리오를 아직 불러오는 중이에요. 잠시 후 다시 보내주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const next = [...history, { role: "user", content }];
    setHistory(next);
    try {
      const out = await postConsult({ provider, messages: next, scenario,
        context: agentContext(store.getState()) });
      const rows = { ...toolRows };
      const callIds = [];
      for (const m of out.messages) {
        for (const c of m.tool_calls || []) callIds.push(c.id);
      }
      (out.toolCalls || []).forEach((t, i) => {
        if (callIds[i]) rows[callIds[i]] = { id: callIds[i], ...t };
      });
      setToolRows(rows);
      const appended = [...out.messages];
      if (out.view) {
        appended.push({ role: "system", content: viewSystemLine(out.view) });
      }
      setHistory([...next, ...appended]);
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
      // Tour step with no key: answer from the recorded reply instead.
      const rec = tourAskKey() ? recordedReplyFor(tourAskKey()) : null;
      if (rec && /is not set/.test(err.message)) {
        const rows = { ...toolRows };
        const calls = (rec.tools || []).map((t, i) => {
          const id = `recorded-${i}`;
          rows[id] = { id, name: t.name, ok: t.ok !== false,
            summary: t.summary || "", ms: t.ms || 0 };
          return { id, name: t.name };
        });
        setToolRows(rows);
        setHistory([...next, { role: "assistant", content: rec.a,
          recorded: true, tool_calls: calls }]);
        setError("");
      } else {
        setError(err.message);
      }
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

  // Tour agent step: ask the recorded question once the scenario is ready.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current || !scenario || busyRef.current) return;
    const rec = tourAskKey() ? recordedReplyFor(tourAskKey()) : null;
    if (rec) {
      askedRef.current = true;
      send(rec.q);
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
        <ToggleButton size="sm" label="알림" isPressed={nudgesOn}
          onPressedChange={(v) => store.set({ agentNudges: v })} />
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
          ) : m.role === "system" ? (
            <ChatSystemMessage key={i}>{m.content}</ChatSystemMessage>
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
      <div className="ui-agent-chips" role="group" aria-label="추천 질문">
        {chipsFor(compareTab).map((chip) => (
          <Button key={chip} size="sm" variant="secondary" label={chip}
            onClick={() => send(chip)} />
        ))}
      </div>
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
  const recorded = tourAskKey() ? recordedReplyFor(tourAskKey()) : null;
  if (doc === undefined && !recorded) return <Text type="supporting">불러오는 중…</Text>;
  if ((!doc || !Array.isArray(doc.messages) || doc.messages.length === 0) && !recorded) {
    return (
      <EmptyState isCompact title="아직 데모 대화가 없습니다"
        description="로컬 개발 서버에서 Muse 키로 상담을 실행하면 여기에 기록이 표시됩니다." />
    );
  }
  const messages = [
    ...(recorded ? [{ role: "user", text: recorded.q },
      { role: "assistant", text: recorded.a, recorded: true,
        toolCalls: recorded.tools || [] }] : []),
    ...((doc && doc.messages) || []),
  ];
  return (
    <ChatMessageList density="compact">
      {messages.map((m, i) => (m.role === "user" ? (
        <ChatMessage key={i} sender="user">
          <ChatMessageBubble>{m.text}</ChatMessageBubble>
        </ChatMessage>
      ) : m.role === "system" ? (
        <ChatSystemMessage key={i}>{m.text}</ChatSystemMessage>
      ) : (
        <ChatMessage key={i} sender="assistant">
          {m.recorded && (
            <ChatMessageBubble variant="ghost" width="100%">
              <Badge variant="yellow" label="기록된 답변" />
            </ChatMessageBubble>
          )}
          {m.text && (
            <ChatMessageBubble variant="ghost">
              <Markdown>{m.text}</Markdown>
            </ChatMessageBubble>
          )}
          <ToolRows rows={(m.toolCalls || []).map((t, k) => ({
            id: `${i}-${k}`, name: t.name, ok: t.ok !== false,
            summary: t.summary || "", ms: t.ms || 0,
          }))} />
          <CiteRows tools={(m.toolCalls || []).map((t) => t.name)} />
        </ChatMessage>
      )))}
    </ChatMessageList>
  );
}

// Gentle nudges: at most one Toast per minute, dismissable, off with the
// setting or reduced motion. Tapping "설명해 줘" opens the panel and asks.
const NUDGE_QUESTIONS = {
  "crowd": "지금 타는 칸이 왜 피곤한지 설명해 줘",
  "muse-first": "방금 고른 이유를 보여줘",
};

function AgentNudge({ corner, onAsk }) {
  const snap = useSyncExternalStore(store.subscribe,
    () => {
      const s = store.getState();
      return { journey: s.journey, judgeLog: s.judgeLog, money: s.money,
        home: s.home, on: s.agentNudges };
    },
    () => {
      const s = store.getState();
      return { journey: s.journey, judgeLog: s.judgeLog, money: s.money,
        home: s.home, on: s.agentNudges };
    });
  const [seen, setSeen] = useState([]);
  const [lastAt, setLastAt] = useState(null);
  const [dismissed, setDismissed] = useState("");
  const [reduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const nudge = snap.on && !reduced ? nudgeFor(snap, seen) : null;
  const visible = nudge && nudge.id !== dismissed
    && nudgeAllowed(lastAt, Date.now());
  useEffect(() => {
    if (visible) setLastAt(Date.now());
  }, [visible, nudge && nudge.id]);
  if (!visible) return null;
  const question = NUDGE_QUESTIONS[nudge.id]
    || (nudge.id.startsWith("jeonse-") ? "보증금이 집값의 몇 %인지 설명해 줘" : "이거 설명해 줘");
  return (
    <div className={`ui-agent-nudge overlay${corner === "bottom-left" ? " ui-agent-nudge-left" : ""}`}>
      <Toast body={nudge.text}
        endContent={<Button size="sm" label="설명해 줘" onClick={() => {
          setSeen([...seen, nudge.id]);
          onAsk(question);
        }} />}
        onDismiss={() => {
          setSeen([...seen, nudge.id]);
          setDismissed(nudge.id);
        }} />
    </div>
  );
}

function measureAvoid() {
  if (typeof document === "undefined" || typeof window === "undefined") return [];
  const rects = [];
  const now = document.querySelector(".ui-simleft");
  if (now) {
    const r = now.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  }
  // The followed resident stays near the frame centre: keep a generous
  // central box clear (approximation, documented).
  rects.push({ x: window.innerWidth * 0.36, y: window.innerHeight * 0.28,
    w: window.innerWidth * 0.28, h: window.innerHeight * 0.44 });
  return rects;
}

export function ConsultPanel() {
  const consultOpen = useSyncExternalStore(store.subscribe,
    () => store.getState().consultOpen, () => store.getState().consultOpen);
  const scenarioName = useSyncExternalStore(store.subscribe,
    () => store.getState().scenarioName, () => store.getState().scenarioName);
  const [pending, setPending] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [corner, setCorner] = useState("bottom-right");
  const setOpen = (next) => {
    if (next && typeof window !== "undefined") {
      const placed = placeAgentPanel({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        avoid: measureAvoid(),
        panel: { w: AGENT_PANEL_W, h: AGENT_PANEL_H },
      });
      setCorner(placed.corner);
      setMinimized(false);
    }
    store.set({ consultOpen: next });
  };

  // The money tab's "C로 추가" sends through the agent (server tools own
  // the scenario + housing lookups). Opens the panel and queues the text.
  useEffect(() => {
    store.registerActions({
      consultSend: (text) => {
        setPending({ text: String(text || ""), at: Date.now() });
        setOpen(true);
      },
    });
  }, []);

  const host = typeof document === "undefined" ? null : document.getElementById("ui-root");
  if (!host) return null;
  return createPortal(
    <>
      <div className={`ui-agent-fab overlay ui-agent-${corner}`}>
        <Popover placement="above" alignment={corner === "bottom-right" ? "end" : "start"}
          width={AGENT_PANEL_W} padding={0} label="시뮬레이션 상담"
          isOpen={consultOpen} onOpenChange={setOpen} hasLightDismiss={false}
          content={(
            <div className="ui-agent-panel"
              style={minimized ? undefined : { height: AGENT_PANEL_H }}>
              <div className="ui-agent-head">
                <Avatar name="상담 에이전트" size="sm" tooltip={false} />
                <VStack gap={0}>
                  <Heading level={4}>물어보기</Heading>
                  <Text type="supporting">조건 정하기 · 결과 설명 · 다시 실행</Text>
                </VStack>
                <span className="ui-panel-spacer" />
                <Button size="sm" variant="ghost"
                  label={corner === "bottom-right" ? "왼쪽으로" : "오른쪽으로"}
                  onClick={() => setCorner(nextAgentCorner(corner))} />
                <Button size="sm" variant="ghost" label={minimized ? "펴기" : "접기"}
                  onClick={() => setMinimized(!minimized)} />
                <Button size="sm" variant="ghost" label="닫기"
                  onClick={() => setOpen(false)} />
              </div>
              {!minimized && (
                <div className="ui-agent-body">
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
              )}
            </div>
          )}>
          <div className="ui-agent-trigger">
            <Avatar name="상담 에이전트" size="md" tooltip={false}
              onClick={() => setOpen(!consultOpen)} />
            <Button size="md" label="물어보기" onClick={() => setOpen(!consultOpen)} />
          </div>
        </Popover>
      </div>
      <AgentNudge corner={corner} onAsk={(question) => {
        setPending({ text: question, at: Date.now() });
        setOpen(true);
      }} />
    </>,
    host,
  );
}

// Back-compat alias (tests / older call sites).
export const ConsultDrawer = ConsultPanel;
