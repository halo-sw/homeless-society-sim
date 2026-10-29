// Chat message components (React, Astryx), shared by the conversation
// view (12b, B). The stage-10/11 floating panel is gone — the chat
// screen renders these rows instead — but the tool-call rows,
// citations, system messages and the no-key recorded replies carry
// over unchanged.
//
// Dev: live agent over POST /api/consult (key on the dev server only),
// with the current view attached so "이거" resolves. Conversations
// live in browser memory only; the server stores nothing.
import { Badge } from "@astryxdesign/core/Badge";
import { Citation } from "@astryxdesign/core/Citation";
import { HStack } from "@astryxdesign/core/HStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import {
  ChatMessage, ChatMessageBubble, ChatToolCalls,
} from "@astryxdesign/core/Chat";
import { store } from "./store.js";
import { citationsFor, toolActionKo, toolDurationKo } from "./agent-float.js";

export const PROVIDER_BADGE = { meta: "Muse Spark 1.3", baseten: "Muse Spark Open" };

export function ToolRows({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <ChatToolCalls calls={rows.map((r) => ({
        key: r.id,
        name: toolActionKo(r.name),
        status: r.ok ? "complete" : "error",
        target: r.summary,
        duration: toolDurationKo(r.ms),
      }))} />
    </ChatMessageBubble>
  );
}

export function CiteRows({ tools }) {
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

export function AssistantMsg({ msg, toolRows }) {
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

// Merge agent money results into the store so the 생활비 tab can show
// home C and the "C로 추가" candidates. Pure over the message list.
export function mergeMoneyResults(messages) {
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
