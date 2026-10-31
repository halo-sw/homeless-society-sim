// Chat message components (React, Astryx), shared by the conversation
// view (12b, B). The stage-10/11 floating panel is gone — the chat
// screen renders these rows instead — but the tool-call rows,
// citations, system messages and the no-key recorded replies carry
// over unchanged.
//
// Dev: live agent over POST /api/consult (key on the dev server only),
// with the current view attached so "이거" resolves. Conversations
// live in browser memory only; the server stores nothing.
import { Citation } from "@astryxdesign/core/Citation";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import {
  ChatMessage, ChatMessageBubble, ChatToolCalls,
} from "@astryxdesign/core/Chat";
import { store } from "./store.js";
import { citationsFor, toolActionKo, toolDurationKo } from "./agent-float.js";
import { SOURCES, sourceById } from "../sources.js";
import { LANG } from "../i18n/lang.js";

export const PROVIDER_BADGE = { meta: "Muse Spark 1.3", baseten: "Muse Spark Open" };

export function ToolRows({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <Collapsible
        trigger={<Text type="supporting">{`확인한 것 ${rows.length}가지`}</Text>}
        defaultIsOpen={false}>
        <ChatToolCalls calls={rows.map((r) => ({
          key: r.id,
          name: toolActionKo(r.name),
          status: r.ok ? "complete" : "error",
          target: r.summary,
          duration: toolDurationKo(r.ms),
        }))} />
      </Collapsible>
    </ChatMessageBubble>
  );
}

export function shortSourceName(fullName) {
  const s = SOURCES.find((e) => e.name === fullName);
  return (s && (s.short || s.name)) || fullName;
}

export function CiteRows({ tools, sourceIds = null, candidates = null, toolCalls = null }) {
  // 26k: sourceIds overrides the tool citations (USD candidates/runs
  // cite the US entries from sources.js); null keeps the old mapping.
  // 29a4: chips show the short name (sources.js `short`) with the full
  // name in `title`, and never truncate.
  // 29a7b: an all-US find_homes list cites Zillow ZORI + OSM, never MOLIT.
  const fromIds = (Array.isArray(sourceIds) ? sourceIds : [])
    .map((id) => sourceById(id)).filter(Boolean)
    .map((s) => ({ short: s.short || s.name, title: s.name, url: s.url }));
  const cites = fromIds.length > 0 ? fromIds : citationsFor(tools || [], { candidates, toolCalls })
    .map((c) => ({ short: shortSourceName(c.title), title: c.title, url: c.url }));
  if (cites.length === 0) return null;
  return (
    <ChatMessageBubble variant="ghost" width="100%">
      <div className="ui-cites">
        <HStack gap={1} vAlign="center" wrap="wrap">
          <span className="ui-cite-label">확인한 출처</span>
          {cites.map((c, i) => (
            <span key={`${c.title}-${i}`} title={c.title} className="ui-cite">
              <Citation variant="label" number={i + 1}
                source={c.url ? { title: c.short, url: c.url } : { title: c.short }} />
            </span>
          ))}
        </HStack>
      </div>
    </ChatMessageBubble>
  );
}

// 26s: in English mode, bubbles showing model-written text (msg.fromModel)
// carry data-no-i18n so the DOM translator does not re-translate Muse's
// own English (which may hold Korean names in parentheses). Rule-mode
// fallback replies and UI labels stay translatable.
export function AssistantMsg({ msg, toolRows, lang = LANG }) {
  const rows = (msg.tool_calls || []).map((c) => toolRows[c.id]).filter(Boolean);
  const tools = (msg.tool_calls || []).map((c) => c.name);
  if (!msg.content && rows.length === 0) return null;
  const modelText = lang === "en" && msg.fromModel === true;
  return (
    <ChatMessage sender="assistant">
      {msg.recorded && (
        <ChatMessageBubble variant="ghost" width="100%">
          <Text type="supporting">기록된 답변</Text>
        </ChatMessageBubble>
      )}
      {msg.content && (
        <ChatMessageBubble variant="ghost" {...(modelText ? { "data-no-i18n": true } : null)}>
          <Markdown>{msg.content}</Markdown>
        </ChatMessageBubble>
      )}
      <ToolRows rows={rows} />
      <CiteRows tools={tools} toolCalls={msg.tool_calls || []}
        candidates={msg && msg.data && msg.data.result
          ? msg.data.result.candidates || null : null} />
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
