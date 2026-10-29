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
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Markdown } from "@astryxdesign/core/Markdown";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { Toast } from "@astryxdesign/core/Toast";
import {
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble,
  ChatComposer, ChatToolCalls, ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { store, selectAgentNudge, selectAgentNudges, selectCompareOpen,
  selectCompareTab, selectConsultOpen, selectScenarioName } from "./store.js";
import { recordedReplyFor } from "./demotour.js";
import { postConsult, loadScenario, loadDemoTranscript, formatUsage } from "./consult-client.js";
import { agentContext, chipsFor, citationsFor, nextAgentCorner,
  nudgeAllowed, nudgeFor, placeAgentPanel, saveAgentOpen,
  shouldShowAgentFab, toolActionKo,
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

function LiveChat({ scenarioName, pending, onConsumed, provider }) {
  const [history, setHistory] = useState([{ role: "assistant", content: GREETING }]);
  const [toolRows, setToolRows] = useState({});
  const [scenario, setScenario] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState({ prompt_tokens: 0, completion_tokens: 0, est_usd: 0 });
  const busyRef = useRef(false);
  const compareTab = useSyncExternalStore(store.subscribe,
    () => selectCompareTab(store.getState()), () => selectCompareTab(store.getState()));

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
        description="상담 · 조건 정하기 · 결과 설명 · 다시 실행 — 로컬 개발 서버에서 Muse 키로 상담을 실행하면 여기에 기록이 표시됩니다." />
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
  // Stable selector (memoised by state identity): a fresh object per
  // getSnapshot call unmounted the whole UI (stage 10b).
  const snap = useSyncExternalStore(store.subscribe,
    () => selectAgentNudge(store.getState()),
    () => selectAgentNudge(store.getState()));
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

// Obstacle rects measured from the real DOM: the right column card, the
// Now card / left column, the sim bar, the tour bar and the intro card.
// Note: these are CSS px in the scene-wrap frame; the canvas narrows
// with the drawer, so drawer mode needs no rects.
const AVOID_SELECTORS = [".ui-compare", ".ui-simleft", ".ui-simbar", ".ui-tour", ".ui-intro"];

function measureAvoid() {
  if (typeof document === "undefined" || typeof window === "undefined") return [];
  const rects = [];
  for (const sel of AVOID_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  }
  // The followed resident stays near the frame centre: keep a generous
  // central box clear (approximation, documented). Free camera: no box.
  try {
    if (store.getState().follow > 0) {
      rects.push({ x: window.innerWidth * 0.36, y: window.innerHeight * 0.28,
        w: window.innerWidth * 0.28, h: window.innerHeight * 0.44 });
    }
  } catch { /* store unreadable (tests): skip the box */ }
  return rects;
}

// One clean header row: title + model badge, a 설정 menu (provider +
// nudge setting live there now, not in a second row), and icon-only
// actions with labels + tooltips. `height` constrains the panel per
// placement mode (float: fixed, drawer: full, sheet: auto inside the
// sheet wrapper); `showMove` only in float mode.
export function AgentPanel({ scenarioName, pending, onConsumed, provider, setProvider,
    corner, minimized, setMinimized, onMove, onClose, height, showMove }) {
  const nudgesOn = useSyncExternalStore(store.subscribe,
    () => selectAgentNudges(store.getState()), () => selectAgentNudges(store.getState()));
  const settingsItems = [
    ...(IS_DEV ? [
      { id: "provider-meta",
        label: `${provider === "meta" ? "✓ " : ""}Spark 1.3 (Muse Spark 1.3)`,
        onClick: () => setProvider("meta") },
      { id: "provider-baseten",
        label: `${provider === "baseten" ? "✓ " : ""}Spark Open (Muse Spark Open)`,
        onClick: () => setProvider("baseten") },
      { type: "divider" },
    ] : []),
    { id: "nudges", label: `알림 ${nudgesOn ? "끄기" : "켜기"}`,
      onClick: () => store.set({ agentNudges: !nudgesOn }) },
  ];
  return (
    <div className="ui-agent-panel"
      style={minimized || height === undefined ? undefined : { height }}>
      <div className="ui-agent-head">
        <Heading level={4}>물어보기</Heading>
        <Badge variant="blue" label={PROVIDER_BADGE[provider] || PROVIDER_BADGE.meta} />
        <span className="ui-panel-spacer" />
        <MoreMenu label="설정" variant="ghost" size="sm" items={settingsItems} />
        {showMove && (
          <IconButton size="sm" variant="ghost" label="다른 쪽으로 옮기기"
            tooltip="다른 쪽으로 옮기기"
            icon={<Icon icon={corner === "bottom-right" ? "chevronsLeft" : "chevronsRight"} />}
            onClick={onMove} />
        )}
        <IconButton size="sm" variant="ghost" label={minimized ? "펼치기" : "작게 접기"}
          tooltip={minimized ? "펼치기" : "작게 접기"}
          icon={<Icon icon={minimized ? "arrowUp" : "chevronDown"} />}
          onClick={() => setMinimized(!minimized)} />
        <IconButton size="sm" variant="ghost" label="닫기" tooltip="닫기"
          icon={<Icon icon="close" />} onClick={onClose} />
      </div>
      {!minimized && (
        <div className="ui-agent-body">
          {IS_DEV ? (
            <LiveChat scenarioName={scenarioName} pending={pending}
              onConsumed={onConsumed} provider={provider} />
          ) : (
            <VStack gap={2}>
              <Banner status="info" title="상담은 로컬 개발 서버에서 Muse 키로 동작합니다" />
              <DemoTranscript />
            </VStack>
          )}
        </div>
      )}
    </div>
  );
}

export function ConsultPanel() {
  const consultOpen = useSyncExternalStore(store.subscribe,
    () => selectConsultOpen(store.getState()), () => selectConsultOpen(store.getState()));
  const scenarioName = useSyncExternalStore(store.subscribe,
    () => selectScenarioName(store.getState()), () => selectScenarioName(store.getState()));
  const compareTab = useSyncExternalStore(store.subscribe,
    () => selectCompareTab(store.getState()), () => selectCompareTab(store.getState()));
  const compareOpen = useSyncExternalStore(store.subscribe,
    () => selectCompareOpen(store.getState()), () => selectCompareOpen(store.getState()));
  const [pending, setPending] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [corner, setCorner] = useState("bottom-right");
  const [provider, setProvider] = useState("meta");
  const [mode, setMode] = useState("float");
  const preferRef = useRef(null);
  const openRef = useRef(consultOpen);
  openRef.current = consultOpen;
  // The drawer docks as a flex sibling of the canvas (sim layout); tour
  // mode has no compare card and always floats. Mode never changes
  // without a reload, so one read is enough.
  const [simMode] = useState(() => {
    try {
      return store.getState().mode !== "tour";
    } catch {
      return true;
    }
  });

  const remeasure = () => {
    if (typeof window === "undefined") return;
    const placed = placeAgentPanel({
      viewport: { w: window.innerWidth, h: window.innerHeight },
      avoid: measureAvoid(),
      panel: { w: AGENT_PANEL_W, h: AGENT_PANEL_H },
      prefer: preferRef.current,
    });
    const next = placed.mode === "drawer" && !simMode ? "float" : placed.mode;
    setMode(next);
    if (next === "float") setCorner(placed.corner);
  };
  const remeasureRef = useRef(remeasure);
  remeasureRef.current = remeasure;

  const setOpen = (next) => {
    if (next && typeof window !== "undefined") {
      remeasureRef.current();
      setMinimized(false);
    }
    store.set({ consultOpen: next });
  };
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  // Remember open/closed per viewer (every path funnels through the store).
  useEffect(() => {
    saveAgentOpen(consultOpen);
  }, [consultOpen]);

  // Re-run placement when the obstacles change: tab change, card
  // collapse/expand (compareOpen), and open.
  useEffect(() => {
    if (consultOpen) remeasureRef.current();
  }, [consultOpen, compareTab, compareOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize + Now-card height / card size changes (ResizeObserver).
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }
    const onResize = () => {
      if (openRef.current) remeasureRef.current();
    };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize);
      for (const sel of AVOID_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) ro.observe(el);
      }
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, []);

  // Drawer/sheet layout flags for the canvas + cards.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const cls = document.body.classList;
    const drawer = consultOpen && mode === "drawer"
      && !!document.getElementById("panel-root");
    cls.toggle("agent-drawer-open", drawer);
    cls.toggle("agent-sheet-open", consultOpen && mode === "sheet");
    return () => {
      cls.remove("agent-drawer-open");
      cls.remove("agent-sheet-open");
    };
  }, [consultOpen, mode]);

  // The money tab's "C로 추가" sends through the agent (server tools own
  // the scenario + housing lookups). Opens the panel and queues the text.
  useEffect(() => {
    store.registerActions({
      consultSend: (text) => {
        setPending({ text: String(text || ""), at: Date.now() });
        setOpenRef.current(true);
      },
    });
  }, []);

  const host = typeof document === "undefined" ? null : document.getElementById("ui-root");
  if (!host) return null;
  const drawerHost = mode === "drawer" && typeof document !== "undefined"
    ? document.getElementById("panel-root") : null;
  // No drawer mount (tour boot, tests): fall back to floating.
  const effMode = mode === "drawer" && !drawerHost ? "float" : mode;
  const panel = (
    <AgentPanel scenarioName={scenarioName} pending={pending}
      onConsumed={() => setPending(null)} provider={provider} setProvider={setProvider}
      corner={corner} minimized={minimized} setMinimized={setMinimized}
      onMove={() => {
        const next = nextAgentCorner(corner);
        preferRef.current = next;
        setCorner(next);
        remeasureRef.current();
      }}
      onClose={() => setOpenRef.current(false)}
      height={effMode === "drawer" ? "100%" : effMode === "sheet" ? undefined : AGENT_PANEL_H}
      showMove={effMode === "float"} />
  );
  return (
    <>
      {createPortal(
        <>
          {shouldShowAgentFab(consultOpen, effMode) && (
            <div className={`ui-agent-fab overlay ui-agent-${corner}`}>
              <div className="ui-agent-trigger">
                <Popover placement="above" alignment={corner === "bottom-right" ? "end" : "start"}
                  width={AGENT_PANEL_W} padding={0} label="시뮬레이션 상담"
                  isOpen={consultOpen && effMode === "float"} onOpenChange={setOpen} hasLightDismiss={false}
                  content={panel}>
                  <Avatar name="상담 에이전트" size="md" tooltip={false}
                    onClick={() => setOpen(!consultOpen)} />
                </Popover>
                <Button size="md" label="물어보기" onClick={() => setOpen(!consultOpen)} />
              </div>
            </div>
          )}
          {consultOpen && effMode === "sheet" && (
            <div className="ui-agent-sheet overlay">
              {panel}
            </div>
          )}
          <AgentNudge corner={corner} onAsk={(question) => {
            setPending({ text: question, at: Date.now() });
            setOpen(true);
          }} />
        </>,
        host,
      )}
      {consultOpen && effMode === "drawer" && drawerHost && createPortal(
        <div className="ui-agent-drawer overlay">
          {panel}
        </div>,
        drawerHost,
      )}
    </>
  );
}

// Back-compat alias (tests / older call sites).
export const ConsultDrawer = ConsultPanel;
