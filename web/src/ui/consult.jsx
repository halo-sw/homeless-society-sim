// "시뮬레이션 상담" side panel: Astryx Chat in a non-modal Drawer.
//
// Dev: live agent over POST /api/consult (key on the dev server only).
// Production: a notice plus the recorded demo transcript
// (scenarios/consult-demo.json; empty state when absent). Conversations
// live in browser memory only; the server stores nothing.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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
  "먼저 누구와 사는지 알려주세요. (예: 성인 2명)",
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

function LiveChat({ scenarioName }) {
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

export function ConsultDrawer() {
  const consultOpen = useSyncExternalStore(store.subscribe,
    () => store.getState().consultOpen, () => store.getState().consultOpen);
  const scenarioName = useSyncExternalStore(store.subscribe,
    () => store.getState().scenarioName, () => store.getState().scenarioName);
  const setOpen = (next) => store.set({ consultOpen: next });
  return (
    <Drawer isOpen={consultOpen} onOpenChange={setOpen}
      label="시뮬레이션 상담" width={400} hasScrim={false}>
      <Layout
        header={<DrawerHeader title="시뮬레이션 상담"
          subtitle="조건 정하기 · 결과 설명 · 다시 실행" onOpenChange={setOpen} />}
        content={(
          <LayoutContent>
            <div className="ui-consult-chat">
              {IS_DEV ? (
                <LiveChat scenarioName={scenarioName} />
              ) : (
                <VStack gap={2}>
                  <Banner status="info" title="상담은 로컬 개발 서버에서 Muse 키로 동작합니다" />
                  <DemoTranscript />
                </VStack>
              )}
            </div>
          </LayoutContent>
        )}
      />
    </Drawer>
  );
}
