// Conversation view (12b, B): the chat replaces the floating agent.
// Shell from shell-top-nav (AppShell + the shared TopBar: product
// name, mode switch, profile chip, 설정 sheet), transcript from
// ai-chat (ChatLayout + message list + composer, chat column ≈440px,
// work area right). Template sample content (JWT doc, shop items,
// artifact panel) is removed; the work area is our 3D scene +
// candidate/result cards.
//
// Every step renders as a message with a data card: ProfileCard (each
// field with its source), CandidatesCard (preview cards + customer
// sort + pick 2–3), SimulationCard (progress, then plain-words
// comparison + 3D에서 보기), ListingCard (paste check) and TabCards
// (the existing 전세/살 만한가/도움 tabs, opened from the chat).
//
// Two answer paths, same cards: the deterministic client engine
// (chat/engine.js — no key, real data) drives the fixed flow, and the
// live agent (dev key) answers free questions; its recognised tool
// results render as the same cards. No-key recorded replies
// (?ask=…) carry over with the 기록된 답변 badge.
import { Component, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import {
  ChatLayout, ChatMessageList, ChatMessage, ChatMessageBubble,
  ChatComposer, ChatComposerDrawer, ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { useResizable, ResizeHandle } from "@astryxdesign/core/Resizable";
import { percent, pixel } from "@astryxdesign/core/Resizable/utils";
import { store, selectState } from "./store.js";
import { AssistantMsg, ToolRows, CiteRows, mergeMoneyResults } from "./consult.jsx";
import { IntakeCard, HouseholdCard } from "./intake.jsx";
import { CandidateCard, CandidateSkeleton, areaForList, HomeName, listPhotoNote, listThumbKinds } from "./candidate-card.jsx";
import { exampleLine } from "./copy.js";
import { TopBar, usePhoneMedia } from "./topbar.jsx";
import { EXAMPLE_PROMPTS, COVERAGE_AREAS, COVERAGE_US_LINE, LANDING_HEADING, LANDING_SUB } from "./landing.jsx";
// 18: StageArea renders ChatMap (./chatmap.jsx), not the slab OrbView.
import { toast, Toaster } from "./toast.jsx";
import {
  INTAKE_STEPS, INTAKE_KO, intakeState0, currentStep, prefillFromExtract,
  answerStep, skipStep, household0, householdFromExtract, addMember, removeMember,
  intakeToProfilePatch, intakeTookLine, householdHint,
} from "../intake.js";
import { selectPhotosForList } from "../places/select-photos.js";
import { newUsageLog, recordTurn } from "../models/catalog.js";
import { loadByoKey } from "../consult/byok.js";
import { buildChatMap, extractGreenRings } from "../chatmap.js";
import { ChatMap } from "./chatmap.jsx";
import { mapFilterChips, filterPatch } from "./map-filters.js";
import { defaultOverrides, setOverride, resetOverride,
  encodeOverrides, decodeOverrides } from "../assumptions.js";
// Cycle with app.jsx (it renders ChatScreen): render-time use only,
// so module evaluation order is safe.
import { CompareCard, CompareTabBody } from "./app.jsx";
import { HowCalculated, tenureOf } from "./money.jsx";
import { fmtMinutes, fmtWon, fmtWonShort } from "../money/format.js";
import { fmtMoney, currencyOf } from "../money/currency.js";
import { monthlyHousingOf } from "../money/monthly.js";
import { myScore, priorityValues } from "../priorities.js";
import { pickMoments } from "../engine/moments.js";
import { lifeEvents, lifeEventLines } from "../engine/life-events.js";
import { oneWayByLabel, oneWayDelta, oneWaySentence } from "../verify/numbers.js";
import { ShareDialog } from "./share.jsx";
import { JeonseTab } from "./jeonse.jsx";
import { WorthItTab } from "./worthit.jsx";
import { SupportTab } from "./support.jsx";
import { PasteCheck } from "./listings.jsx";
import { HOME_SORTS, HOME_SORT_KO, HOME_SORT_SHORT_KO, applyKindPreference, usEmptyHint, displayNameFor } from "../homes.js";
import { chipSourceIds } from "../sources.js";
import { META_HQ_EXAMPLE } from "../places-us.js";
import { EXAMPLE_PROFILE_LABEL, noCommuteEntry } from "../profile.js";
import { outingsFor, hhmm } from "../timeline.js";
import { runDigest } from "../diary/digest.js";
import {
  extractStep, searchStep, searchWithBoxes, scenarioStep, runStep,
  loadHomesIndex, loadNetwork, loadSchedule, loadPhotosManifest,
  loadNamedPhotos, loadRegions, loadPayroll, loadCorridorTiles,
  loadBoxArea, createWorkerRunner, fieldRows, sourceKo,
  profileSummary, missingChips, regionsForNames, simReadyFor,
  homeForScenario, complexNameForCandidate, stationNames,
  runGate, profileHomeKinds, regionsForCurrency, regionsForDoc,
} from "../chat/engine.js";
import { buildCustomMoneyDoc, buildUsRentMoneyDoc } from "../chat/custom-money.js";
import { newCustomId, saveCustomRun } from "../chat/idb.js";
import { chatUrl, simMomentUrl, tourUrl, withoutEmbed, saveTranscript, loadTranscript,
  clearTranscript, parseChatSearch } from "../chat/urls.js";
import { recordingUrl, validateRecording, replaySchedule, RECORDINGS } from "../chat/recording.js";
import { ruleTurnPlan } from "../chat/intent.js";
import { postConsultStream, postDiary, loadScenario } from "./consult-client.js";
import { shouldCallMuse, isNoKeyError, KEYLESS_LINE,
  getMuseLive, getMuseStatus, subscribeMuseLive, setMuseLive, refreshMuseLive } from "./muse-status.js";
import { voiceSupported, voiceKeyReady } from "./voice.js";
import { MicButton, VOICE_DONE_NOTE, VOICE_ERROR_NOTE } from "./voice-button.jsx";
import { LIVE_API, appUrl } from "../paths.js";
import { PoweredByMuse } from "./powered-by-muse.jsx";
import { recordedReplyFor } from "./demotour.js";
import { REGION_NAME_ALIASES } from "../region-names.js";
import { agentContext, stripToolLabel, toolActionKo, toolActionEn, viewSystemLine } from "./agent-float.js";
import { LANG, currentLang } from "../i18n/lang.js";
import { translateExact } from "../i18n/translate.js";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
const IS_DEV = ENV.DEV === true;

const CHIP_SHORT = {
  members: "누구와?", workplaces: "어디로 출근?",
  tenure: "전세·월세·매매?", depositMax: "보증금 상한?",
  monthlyMax: "한 달 상한?", priceMax: "매매가 상한?",
  sizeMin: "집 크기?", commuteMax: "출퇴근 상한?",
};
const CHIP_STARTER = {
  members: "함께 사는 사람: ", workplaces: "출근: ",
  tenure: "살고 싶은 형태: ", depositMax: "보증금 ",
  monthlyMax: "월 ", priceMax: "매매 ",
  sizeMin: "집 크기: ", commuteMax: "출퇴근 ",
};

// --- ProfileCard ------------------------------------------------------------------

// Said values as one summary line ("2인 · 강남 출근 · 전세 4억 이하 ·
// 59㎡ 이상"): household, workplace, tenure+budget, size, commute cap.
function customerChips(profile) {
  const rows = fieldRows(profile);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const set = (r) => r && r.text !== "아직" && r.text !== "아직 몰라요";
  const out = [];
  if (set(by.members)) out.push(by.members.text);
  if (set(by.workplaces)) {
    const v = by.workplaces.value;
    if (Array.isArray(v) && v[0] && v[0].noCommute) {
      out.push("출근 없이");
    } else {
      const known = Array.isArray(v) && v[0] && v[0].resolved;
      out.push(known ? `${by.workplaces.text} 출근` : by.workplaces.text);
    }
  }
  if (set(by.home_kinds)) out.push(by.home_kinds.text);
  if (set(by.tenure)) {
    const t = by.tenure.value;
    const budget = t === "jeonse" ? by.depositMax
      : t === "wolse" ? by.monthlyMax : t === "trade" ? by.priceMax : null;
    out.push(set(budget) ? `${by.tenure.text} ${budget.text} 이하` : by.tenure.text);
  }
  if (set(by.sizeMin)) out.push(`${by.sizeMin.text} 이상`);
  if (set(by.commuteMax)) out.push(`출퇴근 ${by.commuteMax.text} 이내`);
  return out;
}

export function ProfileCard({ profile, example, onChip }) {
  const rows = fieldRows(profile);
  const chips = missingChips(profile);
  const said = customerChips(profile);
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>고객님 상황</Heading>
          {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
        </HStack>
        {said.length > 0 && (
          <Text>{said.join(" · ")}</Text>
        )}
        {chips.length > 0 && (
          <VStack gap={2}>
            <Text type="supporting">{`모르는 값 ${chips.length}개 — 채우면 더 정확해요`}</Text>
            <HStack gap={1} vAlign="center" wrap="wrap">
              {chips.map((c) => (
                <Button key={c.field} size="sm" variant="secondary"
                  label={CHIP_SHORT[c.field] || c.ask}
                  onClick={() => onChip && onChip(c.field, CHIP_STARTER[c.field] || "")} />
              ))}
            </HStack>
          </VStack>
        )}
        <details className="ui-section" data-profile-details="">
          <summary className="ui-section-head">자세히</summary>
          <div className="ui-section-body">
            <MetadataList>
              {rows.map((r) => (
                <MetadataListItem key={r.key} label={r.label}>
                  <VStack gap={0}>
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      <Text hasTabularNumbers>{r.text}</Text>
                      {sourceKo(r.source) !== "" && (
                        <Text type="supporting">{sourceKo(r.source)}</Text>
                      )}
                    </HStack>
                    {r.note && r.note !== r.label && r.note !== r.text && (
                      <Text type="supporting">{r.note}</Text>
                    )}
                  </VStack>
                </MetadataListItem>
              ))}
            </MetadataList>
          </div>
        </details>
      </VStack>
    </Card>
  );
}

// --- CandidatesCard ------------------------------------------------------------------

function readinessNote(candidate) {
  const r = simReadyFor(candidate, null);
  return r.ready ? "" : r.reason;
}

// 18: one run-readiness verdict shared by the chat card, the drawer
// card and the sticky run button — same label, same disabled state,
// same handler, so no copy can stall while another works.
// 29a6c: short tray CTA — the full sentence truncated in the map tray.
export const RUN_BUTTON_LABEL = "30일 살아 보기";

// 26m: split a joined money cell ("월 $4,261 (ZIP 추정)",
// "$4,261 (ZIP estimate)/mo") into its amount line and its small source
// note, so phones render them on two lines instead of wrapping mid-word.
// Strings without a trailing parenthetical pass through untouched.
export function splitMoneyNote(text) {
  const s = String(text || "");
  const m = /^(.*?)\s*(\([^()]*\))\s*(\/mo)?\s*$/.exec(s);
  if (!m || !m[1]) return { main: s, note: "" };
  return { main: `${m[1]}${m[3] || ""}`, note: m[2] };
}

// 18d: the scroll target for a fresh simulation card. handleRun sets
// it the moment the card is created (progress and result render inside
// the same card far below the fold), so the chat moves there at once.
export const SIM_CARD_ATTR = "data-sim-card";

// After the next paints, so the pushed card exists in the DOM.
function soon(fn) {
  try {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(fn));
      return;
    }
  } catch {
    // Fall through to the timer.
  }
  setTimeout(fn, 0);
}

// Scroll the chat thread to the simulation card. Takes a
// document-like so tests pass a fake. Returns true when a target was
// scrolled into view.
export function scrollChatToSim(simId, root) {
  try {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    const el = (simId && doc.querySelector(`[${SIM_CARD_ATTR}="${simId}"]`))
      || doc.querySelector(`[${SIM_CARD_ATTR}]`);
    if (!el || typeof el.scrollIntoView !== "function") return false;
    let reduced = false;
    try {
      const mq = doc.defaultView && doc.defaultView.matchMedia
        && doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)");
      reduced = !!(mq && mq.matches);
    } catch {
      // Motion default stands.
    }
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    return true;
  } catch {
    return false;
  }
}

// 29a4: suggestion chips fold while the customer reads — the chip row
// shows only while the thread scroller is within 160 px of the bottom.
export function chipsVisible(scrollTop, scrollHeight, clientHeight) {
  return scrollHeight - scrollTop - clientHeight <= 160;
}

// 31d: keep the list pinned while the reader is at the bottom —
// true only when they were already at the bottom (within the same
// 160 px threshold) and still are after the content grew. A reader
// who scrolled up is never moved.
export function shouldPinToBottom(wasAtBottom, scrollTop, scrollHeight, clientHeight) {
  return !!wasAtBottom && chipsVisible(scrollTop, scrollHeight, clientHeight);
}

// 29a4: the single Chat/View pane toggle — one mount point per layout
// (top bar on desktop, its own row on phones), never both at once.
export function ChatPaneTabs({ view, onChange }) {
  return (
    <div className="ui-chat-narrowtabs">
      <SegmentedControl label="화면 선택" value={view}
        onChange={onChange} size="sm" layout="fill">
        <SegmentedControlItem value="chat" label="대화" />
        <SegmentedControlItem value="work" label="지도·후보" />
      </SegmentedControl>
    </div>
  );
}

// 29a4: where the single pane toggle mounts — null keeps it unmounted.
export function paneTabsMount({ workOpen, phone }) {
  if (!workOpen) return null;
  return phone ? "shell" : "top";
}

// 32a: one breakpoint for the whole narrow layout (대화 / 지도·후보
// tabs, stacked panes) — 900 px, shared by the CSS and this hook so
// they can't drift. SSR-safe (false on the server).
export const NARROW_MAX_WIDTH = 900;

export function useNarrowMedia() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const q = window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH}px)`);
    setNarrow(q.matches);
    const fn = (e) => setNarrow(e.matches);
    if (q.addEventListener) q.addEventListener("change", fn);
    return () => { if (q.removeEventListener) q.removeEventListener("change", fn); };
  }, []);
  return narrow;
}

// 32a2: the tray placement predicates — the full tray lives over the
// stage only. On the narrow layout it renders solely on the Map pane;
// the narrow chat pane keeps the in-flow compact run row (which is
// never .ui-picks-tray). Pure; unit-tested.
export function compactTrayVisible({ narrow, view } = {}) {
  return !!narrow && view !== "work";
}
export function stageTrayVisible({ narrow, view } = {}) {
  return !narrow || view === "work";
}

// 32a: the thread panel width, remembered per viewer in localStorage.
// Every read/write is guarded — the page works without storage.
// 32a2: the live shell persists through the hook's autoSaveId instead;
// these stay for older callers and the width-memory test.
export const THREAD_WIDTH_KEY = "ui-chat-thread-w";
export const THREAD_WIDTH_MIN = 320;
export const THREAD_WIDTH_MAX = 720;

export function threadWidthKey(viewer) {
  return viewer ? `${THREAD_WIDTH_KEY}:${viewer}` : THREAD_WIDTH_KEY;
}

export function loadThreadWidth(viewer) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(threadWidthKey(viewer));
    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    return Math.min(THREAD_WIDTH_MAX, Math.max(THREAD_WIDTH_MIN, v));
  } catch {
    return null;
  }
}

export function saveThreadWidth(viewer, width) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const v = Number(width);
    if (!Number.isFinite(v)) return;
    window.localStorage.setItem(threadWidthKey(viewer),
      String(Math.min(THREAD_WIDTH_MAX, Math.max(THREAD_WIDTH_MIN, v))));
  } catch {
    // A locked-down store never breaks the page.
  }
}

// 27f: follow the conversation — scroll the message list to the end.
export function scrollChatToEnd(root) {
  try {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    const list = doc.querySelector(".astryx-chat-message-list");
    if (!list) return false;
    list.scrollTop = list.scrollHeight;
    return true;
  } catch {
    return false;
  }
}

// 27g: client safety net — a stray [[다음: ...]] marker never reaches
// the screen (same end-anchored split as splitSuggestions in agent.js).
function stripNextMarker(reply) {
  const text = String(reply || "");
  const m = text.match(/\[\[\s*(?:다음|Next)\s*:\s*([^\]]+?)\s*\]\]\s*$/);
  if (!m) return text;
  return text.slice(0, m.index).trim();
}

// 27f: one bubble per turn — pure part of askAgent message merging.
export function turnBubble(out) {
  const msgs = (out && out.messages) || [];
  let content = (out && typeof out.reply === "string" && out.reply.trim() !== "")
    ? out.reply
    : "";
  if (!content) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === "assistant" && typeof m.content === "string" && m.content.trim() !== "") {
        content = m.content;
        break;
      }
    }
  }
  const tool_calls = [];
  for (const m of msgs) {
    if (m && m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) tool_calls.push(c);
    }
  }
  return { content: stripNextMarker(content), tool_calls };
}

// 27f: diary failure fallback line — pure, tested.
// 26t: deterministic in both languages (never marked data-no-i18n).
// Korean is byte-identical to today; English is built directly.
export function diaryFallbackLine(oneWay, names, lang = "ko") {
  const nmA = (names && names.A) || "A";
  const nmB = (names && names.B) || "B";
  const hasC = names && names.C !== undefined && names.C !== null && names.C !== "";
  if (lang === "en") {
    const fmt = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v))
      ? "–" : `${Math.round(Number(v))} min`);
    const a = fmt(oneWay && oneWay.A);
    const b = fmt(oneWay && oneWay.B);
    let line = `Finished living there. A ${nmA}: average one-way commute ${a}; B ${nmB}: ${b}. Couldn't write the diary this time.`;
    if (hasC) {
      const c = fmt(oneWay && oneWay.C);
      line = `Finished living there. A ${nmA}: average one-way commute ${a}; B ${nmB}: ${b}; C ${names.C}: ${c}. Couldn't write the diary this time.`;
    }
    return line;
  }
  const fmt = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v))
    ? "—" : `${Math.round(Number(v))}분`);
  const a = fmt(oneWay && oneWay.A);
  const b = fmt(oneWay && oneWay.B);
  let line = `다 살아 봤어요. A ${nmA}는 출근 편도 평균 ${a}, B ${nmB}는 ${b}이었어요. 일기는 이번에 못 썼어요.`;
  if (hasC) {
    const c = fmt(oneWay && oneWay.C);
    line = `다 살아 봤어요. A ${nmA}는 출근 편도 평균 ${a}, B ${nmB}는 ${b}, C ${names.C}는 ${c}이었어요. 일기는 이번에 못 썼어요.`;
  }
  return line;
}

export function runReadiness(picks, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const picked = list.filter((c) => picks.includes(c.id));
  const unready = picked.filter((c) => readinessNote(c));
  const canRun = picked.length >= 2 && unready.length === 0;
  const hint = picked.length < 2
    ? `비교할 집을 2–3곳 담아 주세요 (지금 ${picked.length}곳)`
    : unready.length > 0
      ? `살아 보기를 못 하는 집이 있어요 (${unready.map((c) => displayNameFor(c)).join("·")})`
      : `${picked.length}곳을 30일씩 살아 보고 비교해 드려요`;
  return { picked, unready, canRun, hint, label: RUN_BUTTON_LABEL };
}

// 29a2: the profile budget (won) for the shown tenure, if set.
export function budgetWonFor(profile, tenure) {
  const v = tenure === "jeonse" ? profile?.depositMax?.value
    : tenure === "wolse" ? profile?.monthlyMax?.value
    : profile?.priceMax?.value;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function CandidatesCard({ data, tenure, sort, onSort, onOpenWork, picks, onTogglePick,
    onPreview3D, onJeonse, onRun, onDetail, onHover, photoDeps, destName, example, highlightId,
    budgetWon = null, onAsk = null }) {
  const candidates = (data && data.candidates) || [];
  // 13: one photo per card at most — dedup across the whole list.
  const withPhotos = selectPhotosForList(candidates, photoDeps || {});
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={4}>{`집 후보 ${candidates.length}곳`}</Heading>
          <Text type="supporting">{`2곳 중 ${(picks || []).length}곳 담음`}</Text>
          {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
        </HStack>
        {candidates.length > 0 && (
          <div className="ui-cand-sortrow">
            <div className="ui-cand-tabs" role="group" aria-label="정렬">
              {HOME_SORTS.map((s) => (
                <button key={s} type="button"
                  className={`ui-cand-tab${s === sort ? " is-on" : ""}`}
                  aria-pressed={s === sort ? "true" : "false"}
                  aria-label={HOME_SORT_KO[s]} title={HOME_SORT_KO[s]}
                  onClick={() => onSort && onSort(s)}>
                  {HOME_SORT_SHORT_KO[s]}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" label="지도에서 보기"
              onClick={() => onOpenWork && onOpenWork()} />
          </div>
        )}
        {data && (
          <Text type="supporting">
            {`조건에 맞는 집 ${data.total_matching.toLocaleString()}곳 중 ${candidates.length}곳 · ${data.sort_note || ""}`}
          </Text>
        )}
        {candidates.length === 0 && (
          <Text>조건에 맞는 집이 없어요. 예산·크기·지역을 조금 넓혀 보세요.</Text>
        )}
        {candidates.length === 0 && data.emptyHint && (
          <Text type="supporting">{data.emptyHint}</Text>
        )}
        {candidates.length > 0 && (
          <Text type="supporting" data-no-i18n>
            <span data-no-i18n>{listPhotoNote(listThumbKinds(withPhotos), areaForList(candidates), currentLang())}</span>
          </Text>
        )}
        <div className="ui-cand-list">
          {withPhotos.map(({ candidate: c, photos }, i) => {
            const pickIdx = (picks || []).indexOf(c.id);
            return (
              <div key={c.id} id={`cand-${c.id}`}
                onMouseEnter={() => onHover && onHover(`home:${c.id}`)}
                onMouseLeave={() => onHover && onHover(null)}>
                <CandidateCard candidate={c} tenure={tenure} destName={destName}
                  variant="row" photos={photos} index={i} picked={pickIdx >= 0}
                  pickLetter={pickIdx >= 0 ? (PICK_LETTERS[pickIdx] || null) : null}
                  highlighted={highlightId === `home:${c.id}`}
                  note={readinessNote(c)} budgetWon={budgetWon}
                  onLive={() => onTogglePick(c)}
                  onJeonse={() => onJeonse(c)} onDetail={() => onDetail && onDetail(c)} />
              </div>
            );
          })}
        </div>
        {data && data.total_matching > candidates.length && (() => {
          const rest = data.total_matching - candidates.length;
          const n = Math.min(6, rest);
          return (
            <Button size="sm" variant="secondary"
              label={`다른 후보 ${n}곳 더 보기 · 남은 ${rest}곳`}
              onClick={() => onAsk && onAsk("다른 후보 더 보여 줘")} />
          );
        })()}
        {candidates.length > 0 && (
          <Text type="supporting">
            {picks.length < 2
              ? "마음에 드는 집을 2곳 담고 \"살아 봐 줘\"라고 말해 보세요"
              : "\"두 집에서 살아 봐 줘\"라고 말하면 30일을 살아 봐요"}
          </Text>
        )}
      </VStack>
    </Card>
  );
}

// --- SimulationCard ---------------------------------------------------------------------

// 18: readable result summary, top to bottom: (a) 내 기준 점수 with
// its caption, (b) 월 주거비 with a 어떻게 계산했나요 link, (c) 하루
// 출퇴근 편도 평균 per commuting member, (d) the pickMoments texts.
// Pure parts are exported for tests. Never sorted, never crowned.
// 18d: monthlyHousingOf lives in money/monthly.js (shared with the
// share card); re-exported here so existing imports keep working.
export { monthlyHousingOf };

export function commuteOneWayOf(compare) {
  const days = (compare && Number(compare.days) > 0) ? Number(compare.days) : 30;
  const out = [];
  for (const m of (compare && compare.members) || []) {
    const w = m.commute_walk_minutes || {};
    const r = m.commute_ride_minutes || {};
    // 21a: a present-but-unmeasurable side (NaN) is missing, never 0.
    const raw = [w.a, w.b, r.a, r.b].map((x) => (
      x === null || x === undefined || x === "" ? 0 : Number(x)));
    if (!raw.every(Number.isFinite)) continue;
    const total = raw[0] + raw[1] + raw[2] + raw[3];
    if (!(total > 0)) continue;
    const one = (x) => Math.round((((Number(x) || 0) / days / 2)) * 10) / 10;
    const a = one((Number(w.a) || 0) + (Number(r.a) || 0));
    const b = one((Number(w.b) || 0) + (Number(r.b) || 0));
    const d = Math.round((b - a) * 10) / 10;
    out.push({ member: m.member, label: m.label, a, b, delta_b_minus_a: d,
      plain: d === 0 ? `${m.label}는 A와 B가 같아요`
        : `${m.label} — ${d > 0 ? "B" : "A"}가 하루 편도 평균 ${Math.round(Math.abs(d) * 10) / 10}분 더 걸려요` });
  }
  return out;
}

export function resultScoreOf(moneyDoc, compare, weights, explicit) {
  if (!moneyDoc || !moneyDoc.homes || !compare) return { ok: false };
  const tenures = {};
  for (const l of Object.keys(moneyDoc.homes)) {
    tenures[l] = tenureOf({ moneyTenure: {} }, l, moneyDoc);
  }
  try {
    return myScore(priorityValues(moneyDoc, compare, tenures),
      weights || null, { explicit: !!explicit });
  } catch {
    return { ok: false };
  }
}

// 26s: diary model text skips the DOM re-translation in English mode.
// Lines are always model-written; the summary is, unless it fell back
// to the Korean rule template (which stays translatable).
export function diaryNoI18n(diary, lang = LANG) {
  if (lang !== "en" || !diary || diary.status !== "done") return false;
  return !(diary.check && diary.check.summary_fallback);
}

// 19d: the 30-day result as an A|B table — one grid, never sorted,
// never crowned. Header: letter disc + name per home. Rows: 내 기준
// 점수 (score + neutral bar, caption spanning below), 월 주거비
// (short value, full value in title), 출퇴근 편도 (one_way, or one
// row per member on older payloads). 살아 보니 and the single
// 어떻게 계산했나요 disclosure live in the SimulationCard done branch.
export function diaryCheckLine(check) {
  const passed = (check && check.passed) || 0;
  const retried = (check && check.retried) || 0;
  const dropped = (check && check.dropped) || 0;
  let line = `✓ 문장 ${passed}개 모두 기록과 대조`;
  if (retried > 0) line += ` · ${retried}번 고쳐 씀`;
  if (dropped > 0) line += ` · ${dropped}줄은 근거가 없어 뺐어요`;
  return line;
}

// 31a: diary lines and 살아 보니 lines share one row-link grid —
// the whole row is a single button opening its scene. Rows without
// a scene URL render the same grid without the link affordance.
export function SceneRowLink({ disc, when, text, url, title, onScene, noI18n }) {
  const cells = (
    <>
      <span className="ui-pick-disc" aria-hidden="true"{...(/^[AB]$/.test(disc) ? { "data-home": disc } : null)}>{disc}</span>
      <span className="ui-result-when">{when}</span>
      <span className="ui-result-text" {...(noI18n ? { "data-no-i18n": true } : null)}>{text}</span>
    </>
  );
  if (!url) {
    return (
      <div className="ui-result-moment">
        {cells}
        <span className="ui-result-go" aria-hidden="true" />
      </div>
    );
  }
  return (
    <button type="button" className="ui-result-moment"
      aria-label={`장면 보기: ${when} · ${disc}`}
      onClick={() => { if (onScene) onScene({ url, title }); }}>
      {cells}
      <span className="ui-result-go" aria-hidden="true">›</span>
    </button>
  );
}

// 31a: 살아 본 일기 — Muse's summary line, the first 3 lines as row
// links, then one secondary button revealing the rest in place.
export function DiarySection({ diary, customId, onScene }) {
  const [open, setOpen] = useState(false);
  if (!diary) return null;
  if (diary.status === "writing") {
    return (
      <Text type="supporting">Muse가 기록을 읽고 일기를 쓰는 중…</Text>
    );
  }
  if (diary.status !== "done") return null;
  const lines = diary.lines || [];
  const shown = open ? lines : lines.slice(0, 3);
  return (
    <VStack gap={2}>
      <span className="ui-result-sect">살아 본 일기</span>
      <p><span className="ui-result-muse">Muse</span> <span {...(diaryNoI18n(diary) ? { "data-no-i18n": true } : null)}>{diary.summary}</span></p>
      {shown.map((line, i) => {
        const when = `${line.day + 1}일째 ${hhmm(line.minute)}`;
        return (
          <SceneRowLink key={i} disc={line.home} when={when} text={line.text}
            url={simMomentUrl({ custom: customId, home: line.home,
              day: line.day + 1, t: hhmm(line.minute), follow: 1, embed: true })}
            title={`${when} · ${line.home}`}
            onScene={onScene} noI18n={LANG === "en"} />
        );
      })}
      {!open && lines.length > 3 && (
        <Button size="sm" variant="secondary" label={`일기 ${lines.length}줄 모두 보기`}
          onClick={() => setOpen(true)} />
      )}
      <Text type="supporting">{diaryCheckLine(diary.check)}</Text>
    </VStack>
  );
}

export function ResultSummary({ data }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const labels = data.labels || [];
  const names = data.names || {};
  const pw = state.priorityWeights;
  const scored = resultScoreOf(data.moneyDoc, data.compare,
    pw && pw.weights, pw && pw.explicit);
  const days = (data.compare && data.compare.days) || 30;
  // 18d: one 출퇴근 편도 per home off the runs (compare.one_way);
  // older payloads without it fall back to the member aggregates.
  const oneWay = oneWayDelta(data.compare && data.compare.one_way);
  const commutes = oneWay ? [] : commuteOneWayOf(data.compare);
  const showMoney = !!(data.moneyDoc || data.moneyMissing);
  return (
    <div className="ui-result-grid">
      <span aria-hidden="true" />
      {labels.map((l) => (
        <span key={l} className="ui-result-head">
          <span className="ui-pick-disc" aria-hidden="true"{...(/^[AB]$/.test(l) ? { "data-home": l } : null)}>{l}</span>
          <span className="ui-result-name"><HomeName name={(names[l] || "").trim() || l} /></span>
        </span>
      ))}
      {scored.ok && [
        <span key="score-label" className="ui-result-label">내 기준 점수</span>,
        ...labels.map((l) => (
          <span key={`score-${l}`} className="ui-result-value">
            {scored.scores[l] === null || scored.scores[l] === undefined ? "–" : `${scored.scores[l]}점`}
            <span className="ui-result-bar" aria-hidden="true">
              <span className="ui-result-fill" style={{ width: `${Number(scored.scores[l]) || 0}%` }} />
            </span>
          </span>
        )),
        <span key="score-caption" className="ui-result-span">{scored.caption}</span>,
      ]}
      {showMoney && [
        <span key="money-label" className="ui-result-label">월 주거비</span>,
        ...labels.map((l) => {
          const mh = monthlyHousingOf(data.moneyDoc, l, days);
          if (mh.missing) {
            return <span key={`money-${l}`} className="ui-result-missing">계산 전</span>;
          }
          // 26d: a USD doc shows the ZIP-estimate rent only — no
          // Korean-only rows (실수령, 대출, 전세 점검).
          if (data.moneyDoc && data.moneyDoc.currency === "USD") {
            const text = `${fmtMoney(mh.monthly, "USD", { monthly: true })} (ZIP 추정)`;
            const parts = splitMoneyNote(text);
            return (
              <span key={`money-${l}`} className="ui-result-value" title={text}>
                <span className="ui-result-main">{parts.main}</span>
                {parts.note && <span className="ui-result-note">{parts.note}</span>}
              </span>
            );
          }
          return (
            <span key={`money-${l}`} className="ui-result-value"
              title={fmtWon(mh.monthly, { monthly: true })}>
              {fmtWonShort(mh.monthly)}
            </span>
          );
        }),
      ]}
      {data.noCommute ? [
        <span key="commute-label" className="ui-result-label">출근 없이</span>,
        ...labels.map((l) => (
          <span key={`commute-${l}`} className="ui-result-value">–</span>
        )),
        <span key="commute-delta" className="ui-result-span">출근 없이 살아 봤어요</span>,
      ] : oneWay ? [
        <span key="commute-label" className="ui-result-label">출퇴근 편도</span>,
        ...labels.map((l) => (
          <span key={`commute-${l}`} className="ui-result-value">
            {fmtMinutes((data.compare.one_way || {})[l])}
          </span>
        )),
        <span key="commute-delta" className="ui-result-span">
          {oneWaySentence(data.compare.one_way, fmtMinutes)}
        </span>,
      ] : commutes.length > 0 ? commutes.map((c) => [
        <span key={`${c.member}-label`} className="ui-result-label">{`${c.label} 출퇴근 편도`}</span>,
        <span key={`${c.member}-a`} className="ui-result-value">{fmtMinutes(c.a)}</span>,
        <span key={`${c.member}-b`} className="ui-result-value">{fmtMinutes(c.b)}</span>,
        <span key={`${c.member}-plain`} className="ui-result-span">{c.plain}</span>,
      ]) : [
        <span key="commute-label" className="ui-result-label">출퇴근 편도</span>,
        ...labels.map((l) => (
          <span key={`commute-${l}`} className="ui-result-value">–</span>
        )),
        <span key="commute-delta" className="ui-result-span">
          {oneWaySentence(
            data.compare ? data.compare.one_way : null, fmtMinutes)}
        </span>,
      ]}
    </div>
  );
}

// 18: run failures in plain Korean (the technical detail stays one
// tap away, never the headline).
export function plainRunError(message) {
  const msg = String(message || "");
  if (/timed out/i.test(msg)) {
    return "30일 계산이 시간 안에 끝나지 않았어요. 다시 시도해 주세요.";
  }
  if (/3D 장면이 없어|has no scene|scene box yet/.test(msg)) {
    return "고른 집 중에 3D 장면이 없는 곳이 있어요. 장면이 있는 집으로 다시 골라주세요.";
  }
  if (/station walk time|station.*walk/i.test(msg)) {
    return "역까지 걸어서 몇 분인지 모르는 집이 있어요. 도보 시간이 확인된 집으로 다시 골라주세요.";
  }
  if (/Worker|worker/i.test(msg)) {
    return "계산기를 열지 못했어요. 페이지를 새로고침하고 다시 시도해 주세요.";
  }
  if (/fetch|network|load|불러오지 못했|404|500/i.test(msg)) {
    return "자료를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
  }
  if (/2곳 이상|at least|2곳/.test(msg)) {
    return "비교하려면 집을 2곳 이상 골라주세요.";
  }
  return "30일 살아 보기를 끝내지 못했어요. 다시 시도해 주세요.";
}

export function SimulationCard({ data, example, onRetry, onScene }) {
  if (!data) return null;
  if (data.status === "running") {
    const p = data.progress || { done: 0, total: 1, label: "" };
    return (
      <Card padding={4}>
        <VStack gap={3}>
          <HStack gap={1} vAlign="center">
            <Heading level={4}>30일 살아 보는 중</Heading>
            {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
          </HStack>
          <ProgressBar label={`살아 보기 진행 중 (${p.done}/${p.total})`}
            value={p.total > 0 ? Math.round((p.done / p.total) * 100) : 0} max={100} />
          <Text type="supporting" hasTabularNumbers>
            {p.label ? `${p.label} 실행 중… (${p.done}/${p.total})` : "준비 중…"}
          </Text>
        </VStack>
      </Card>
    );
  }
  if (data.status === "error") {
    return (
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={4}>30일 살아 보기</Heading>
          <Banner status="warning" title="실행하지 못했어요"
            description={plainRunError(data.error)} />
          {data.error && (
            <details className="ui-section">
              <summary className="ui-section-head">자세한 이유</summary>
              <div className="ui-section-body">
                <Text type="supporting">{data.error}</Text>
              </div>
            </details>
          )}
          <Button size="sm" label="다시 시도"
            onClick={() => onRetry && onRetry()} />
        </VStack>
      </Card>
    );
  }
  const labels = data.labels || [];
  const names = data.names || {};
  const days = (data.compare && data.compare.days) || 30;
  // 19d: one 계산 disclosure for the card (the two HowCalculated
  // blocks, each headed by its letter disc).
  // 26d: a USD doc skips the Korean-only 어떻게 계산했나요 block
  // (대출 rows) — the result row already shows the ZIP-estimate rent.
  const calcs = (data.moneyDoc && data.moneyDoc.currency !== "USD" ? labels : []).map((l) => ({
    label: l, mh: monthlyHousingOf(data.moneyDoc, l, days),
  })).filter(({ mh }) => !mh.missing);
  const texts = data.momentTexts || [];
  const moments = data.moments || [];
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={4}>30일 살아 보기 결과</Heading>
          {data.noCommute && <Text type="supporting">출근 없이</Text>}
          {example && <span className="ui-result-example">{EXAMPLE_PROFILE_LABEL}</span>}
          {data.recorded && <Text type="supporting">기록된 답변</Text>}
        </HStack>
        <Text type="supporting">
          같은 식구가 두 집에서 30일씩 살아 봤어요. 고르는 건 고객님 몫이에요.
        </Text>
        <ResultSummary data={data} />
        {texts.length > 0 && (
          <VStack gap={2}>
            <span className="ui-result-sect">살아 보니</span>
            {texts.map((t, i) => {
              // 19i: the row opens its own moment (day, time, person);
              // only older recorded payloads (no day/minute) use the
              // per-home first outing.
              const url = momentRowUrl(t, { custom: data.customId,
                scenario: data.scenario || null,
                fallback: moments.find((m) => m.label === t.home) || null,
                embed: true });
              return (
                <SceneRowLink key={i} disc={t.home} when={t.when_ko} text={t.text_ko}
                  url={url} title={`${t.when_ko} · ${t.home}`} onScene={onScene} />
              );
            })}
          </VStack>
        )}
        <DiarySection diary={data.diary} customId={data.customId} onScene={onScene} />
        {calcs.length > 0 && (
          <details className="ui-section">
            <summary className="ui-section-head">어떻게 계산했나요</summary>
            <div className="ui-section-body">
              {calcs.map(({ label, mh }) => (
                <VStack gap={1} key={label}>
                  <HStack gap={1} vAlign="center">
                    <span className="ui-pick-disc" aria-hidden="true"{...(/^[AB]$/.test(label) ? { "data-home": label } : null)}>{label}</span>
                    <Text type="supporting">{(names[label] || "").trim() || label}</Text>
                  </HStack>
                  <HowCalculated tenure={mh.tenure} housing={mh.housingDoc}
                    maintenanceWon={mh.maintenanceWon} transitWon={mh.transitWon} />
                </VStack>
              ))}
            </div>
          </details>
        )}
        {Array.isArray(data.lifeEvents) && data.lifeEvents.length > 0 && (
          <VStack gap={1}>
            <span className="ui-result-sect">살아 봐야 아는 것</span>
            {lifeEventLines(data.lifeEvents, labels).map((line, i) => (
              <Text key={i} type="supporting">{line}</Text>
            ))}
          </VStack>
        )}
        <details className="ui-section">
          <summary className="ui-section-head">자세히 보기</summary>
          <div className="ui-section-body">
            <CompareTabBody state={{ compare: data.compare, compareLoading: false }} />
          </div>
        </details>
        {data.extraLine && <Text type="supporting">{data.extraLine}</Text>}
      </VStack>
    </Card>
  );
}

// --- TabCard / ListingCard ---------------------------------------------------------------

const TAB_TITLES = { jeonse: "전세 점검", worthit: "살 만한가?", support: "도움 제도" };

export function TabCard({ tab }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={4}>{TAB_TITLES[tab] || "자세히"}</Heading>
        {tab === "jeonse" && <JeonseTab state={state} />}
        {tab === "worthit" && <WorthItTab state={state} />}
        {tab === "support" && <SupportTab state={state} />}
      </VStack>
    </Card>
  );
}

export function ListingCard({ onAsk }) {
  return (
    <Card padding={4}>
      <PasteCheck onAsk={onAsk} />
    </Card>
  );
}

// --- IntakeFlowCard (13, Part 2) --------------------------------------------------------------
// The guided intake as inline answer cards: current step, household
// (up to 4), then the profile summary + 후보 찾기. Free conversation
// continues at any point (the composer stays live).

// 29a3: short value text for a folded (answered) intake step chip.
function intakeChipText(step, value, skipped) {
  if (skipped) return "건너뜀";
  if (value === undefined || value === null) return "아직";
  if (step === "income") {
    if (!value.amount) return "아직";
    return `${value.kind === "annual" ? "연봉" : "월 실수령"} ${fmtWon(value.amount)}`;
  }
  if (step === "current") return String(value);
  if (step === "areas") return Array.isArray(value) ? `${value.length}곳` : "아직";
  if (step === "living") return (value === null || value === undefined) ? "아직" : `한 달 ${fmtWon(value)}`;
  if (step === "commute") return value.maxMin ? `출퇴근 ${value.maxMin}분` : "아직";
  if (step === "budget") {
    if (value.unknown) return "아직 모름";
    const m = value.depositMax ?? value.monthlyMax ?? value.priceMax;
    return (m === null || m === undefined) ? "정함" : fmtWon(m);
  }
  return "정함";
}

export function IntakeFlowCard({ intake, household, profile, handlers, stations, search }) {
  const [reopened, setReopened] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const step = currentStep(intake);
  const took = profile ? intakeTookLine(profile) : "";
  const hhHint = householdHint(profile, household);
  const memberCount = profile && profile.members
    && Array.isArray(profile.members.value)
    ? profile.members.value.length : null;
  // 21a: one question at a time — the current step only. A 1인
  // household never sees the 함께 사는 사람 form; the said workplace
  // pre-fills its 직장 box otherwise.
  const showHousehold = memberCount === null || memberCount > 1;
  const saidWork = profile && profile.workplaces
    && Array.isArray(profile.workplaces.value)
    && profile.workplaces.value[0]
    ? profile.workplaces.value[0].text || "" : "";
  // 29a3: answered steps fold into chips; tapping one re-opens it.
  // Only one step card is ever open.
  const skipped = intake.skipped || [];
  const answered = INTAKE_STEPS.filter((s) =>
    intake.values[s] !== undefined || skipped.includes(s));
  const open = reopened ?? step;
  const answer = (s, v, k) => { setReopened(null); handlers.onIntakeAnswer(s, v, k); };
  const skip = (s) => { setReopened(null); handlers.onIntakeSkip(s); };
  // 29a3: once results exist the cards step back — chips stay, the
  // open step and the household form hide unless 자세히 opens them.
  const hasResults = Boolean(search && search.hasResults) && !showAll;
  return (
    <VStack gap={2}>
      {took && <Text type="supporting">{took}</Text>}
      {answered.length > 0 && (
        <div className="ui-intake-row">
          {answered.map((s) => (
            <Button key={s} size="sm" variant="secondary"
              label={`${INTAKE_STEPS.indexOf(s) + 1}/${INTAKE_STEPS.length} · ${INTAKE_KO[s]} · ${intakeChipText(s, intake.values[s], skipped.includes(s))} ✎`}
              onClick={() => { setReopened(s); setShowAll(true); }} />
          ))}
        </div>
      )}
      {search && search.hasResults && search.changed && !showAll && (
        <HStack gap={1} vAlign="center">
          <Text>조건이 바뀌었어요</Text>
          <Button size="sm" variant="primary" label="다시 찾기"
            onClick={() => search.onResearch && search.onResearch()} />
        </HStack>
      )}
      {!hasResults && step && !intake.done && open !== null && (
        <IntakeCard step={open} index={INTAKE_STEPS.indexOf(open)}
          total={INTAKE_STEPS.length}
          value={intake.values[open]} said={Boolean(intake.said[open])}
          onAnswer={answer} onSkip={skip} />
      )}
      {intake.done && open && (
        <IntakeCard step={open} index={INTAKE_STEPS.indexOf(open)}
          total={INTAKE_STEPS.length}
          value={intake.values[open]} said={Boolean(intake.said[open])}
          onAnswer={answer} onSkip={skip} />
      )}
      {!hasResults && showHousehold && (
        <HouseholdCard household={household} defaultWorkplace={saidWork}
          stations={stations || []}
          onAdd={handlers.onHouseholdAdd} onRemove={handlers.onHouseholdRemove} />
      )}
      {!hasResults && showHousehold && hhHint && <Text type="supporting">{hhHint}</Text>}
      {search && search.hasResults && (
        <Button size="sm" variant="ghost" label="자세히"
          onClick={() => setShowAll((v) => !v)} />
      )}
      {profile && (
        <ProfileCard profile={profile} example={handlers.exampleId}
          onChip={handlers.onChip} />
      )}
      {profile && (
        <Button size="sm" label="후보 찾기"
          onClick={() => handlers.onFindHomes && handlers.onFindHomes()} />
      )}
    </VStack>
  );
}

// --- message rendering -------------------------------------------------------------------

// 18c: a failing card never takes down the chat — the message list
// and the stage map each render inside this boundary. The fallback
// names the card and carries the technical message in small text.
export class MsgBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ChatMessage sender="assistant">
          <ChatMessageBubble variant="ghost" width="100%">
            <VStack gap={1}>
              <Text>이 카드를 그리지 못했어요 · 다시 시도</Text>
              <Text type="supporting">{String((error && error.message) || error).slice(0, 300)}</Text>
            </VStack>
          </ChatMessageBubble>
        </ChatMessage>
      );
    }
    return this.props.children;
  }
}

export function CardMsg({ msg, handlers, toolRows, cardHi }) {
  const { data } = msg;
  const rows = (msg.tool_calls || []).map((c) => toolRows[c.id]).filter(Boolean);
  const tools = (msg.tool_calls || []).map((c) => c.name);
  // 26k: USD candidates or runs cite the US sources instead of the
  // Korean tool citations (null = unchanged).
  const cands = msg.kind === "candidates" && data && data.result
    ? data.result.candidates : null;
  const runCur = msg.kind === "simulation" && data && data.moneyDoc
    ? data.moneyDoc.currency : null;
  const chipIds = (msg.kind === "candidates" || msg.kind === "simulation")
    ? chipSourceIds({ candidates: cands, currency: runCur }) : null;
  return (
    <ChatMessage sender="assistant">
      {msg.recorded && (
        <ChatMessageBubble variant="ghost" width="100%">
          <Text type="supporting">기록된 답변</Text>
        </ChatMessageBubble>
      )}
      <ChatMessageBubble variant="ghost" width="100%">
        {msg.kind === "profile" && (
          <ProfileCard profile={data.profile} example={msg.example}
            onChip={handlers.onChip} />
        )}
        {msg.kind === "candidates" && (
          <CandidatesCard data={data.result} tenure={data.tenure} sort={data.sort}
            onSort={(s) => handlers.onSort(msg.id, s)}
            onOpenWork={handlers.onOpenWork}
            picks={handlers.picks} onTogglePick={handlers.onTogglePick}
            onPreview3D={handlers.onPreview3D} onJeonse={handlers.onJeonse}
            onRun={handlers.onRun} onDetail={handlers.onDetail}
            onHover={handlers.onHover} photoDeps={handlers.photoDeps}
            destName={handlers.destName} example={msg.example}
            budgetWon={budgetWonFor(handlers.profile, data.tenure)}
            onAsk={handlers.onAsk}
            highlightId={cardHi} />
        )}
        {msg.kind === "intake" && (
          <IntakeFlowCard intake={handlers.intake} household={handlers.household}
            profile={handlers.profile} handlers={handlers}
            stations={handlers.stations} search={handlers.searchState} />
        )}
        {msg.kind === "simulation" && (
          <div data-sim-card={msg.id} id={`sim-card-${msg.id}`}>
            <SimulationCard data={data} example={msg.example}
              onRetry={handlers.onRun} onScene={handlers.onScene} />
          </div>
        )}
        {msg.kind === "listing" && (
          <ListingCard onAsk={handlers.onAsk} />
        )}
        {msg.kind === "tab" && (
          <TabCard tab={data.tab} />
        )}
      </ChatMessageBubble>
      <ToolRows rows={rows} />
      <CiteRows tools={tools} sourceIds={chipIds} toolCalls={msg.tool_calls || []} />
    </ChatMessage>
  );
}

const CHAT_CHIPS = ["매물 글 붙여 넣기", "공공임대 찾기", "도움 제도 보여줘"];

// 26e: USD customers get sort chips instead of the Korean-only ones.
// They map to find_homes sorts (HOME_SORTS): commute / monthly.
const CHAT_CHIPS_US = ["Meta HQ까지 가까운 순", "월세 낮은 순"];

export function chatChipsFor(currency) {
  return currency === "USD" ? CHAT_CHIPS_US : CHAT_CHIPS;
}

// 27b2: every message goes to Muse when live; the rule flow is the fallback.
// 27j: Muse gets another chance next turn until 3 straight failures.
export function routeTurn({ live, museFails = 0, museDown }) {
  const fails = museDown === true ? 3 : museFails;
  return live && fails < 3 ? "agent" : "local";
}

// 27j2: count replies with a ref, not the lagging stateRef.
export function answeredSince(countNow, countBefore) {
  return countNow > countBefore;
}

// 27j: the rules path always answers — fallback line when nothing else replied.
export function localNoAnswerLine(text) {
  const t = String(text || "");
  if (t.includes("찜")) return "찜은 후보 카드의 ‘담기’로 할 수 있어요.";
  if (t.includes("동네")) return "동네는 후보 카드의 3D 미리보기에서 볼 수 있어요.";
  if (t.includes("살아")) return "두 곳을 담고 \"두 집에서 살아 봐 줘\"라고 말하면 30일을 살아 봐요.";
  return "이 요청은 Muse가 다시 연결되면 할 수 있어요. 잠시 뒤 다시 말씀해 주세요.";
}

// 27b2: one live tool row as a busy-bubble line.
// 32a: built per language — English uses TOOL_ACTION_EN and shows the
// summary only on an exact translation (translateExact, never
// romanized), so a row is the label alone when the tail is unknown.
export function liveRowLine(row, lang = currentLang()) {
  const en = lang === "en";
  const label = en ? toolActionEn(row.name) : toolActionKo(row.name);
  if (row.pending) return en ? `▸ ${label}…` : `▸ ${label} 중…`;
  const mark = row.ok === false ? "✕" : "✓";
  const tailRaw = stripToolLabel(row.name, row.summary);
  const tail = en && tailRaw ? translateExact(tailRaw) : tailRaw;
  return tail ? `${mark} ${label} · ${tail}` : `${mark} ${label}`;
}

const WORK_TABS_27B2 = new Set(["compare", "priorities", "money", "worthit", "jeonse", "support"]);
const SCENE_PANELS_27B2 = new Set(["tour", "commute", "result"]);

// 27b2: Muse's uiActions → concrete UI effects, in order.
export function uiEffects(actions, { candidateIds = [], pickCount = 0 } = {}) {
  const effs = [];
  let n = pickCount || 0;
  for (const a of actions || []) {
    if (!a || typeof a.action !== "string") continue;
    if (a.action === "panel") {
      if (a.panel === "map") {
        effs.push({ type: "work" });
      } else if (WORK_TABS_27B2.has(a.panel)) {
        effs.push({ type: "work" });
        effs.push({ type: "tab", tab: a.panel });
      } else if (SCENE_PANELS_27B2.has(a.panel)) {
        effs.push({ type: "work" });
        effs.push({ type: "scene", panel: a.panel,
          home: a.home ?? null, candidate_id: a.candidate_id ?? null,
          day: a.day ?? null, time: a.time ?? null });
      }
    } else if (a.action === "pick") {
      const ids = (Array.isArray(a.ids) ? a.ids : [])
        .filter((id) => candidateIds.includes(id)).slice(0, 3);
      if (ids.length === 0) continue;
      n = ids.length;
      effs.push({ type: "pick", ids });
    } else if (a.action === "run") {
      effs.push(n >= 2 ? { type: "run" } : { type: "say", text: "먼저 두 곳을 찜해 주세요." });
    }
  }
  return effs;
}

// 27c2: resolve a pending scene effect to a panel scene (or a spoken
// fallback). candidates carry scene/name; picks is the id list in pick
// order (A = picks[0]); latestRun is { customId, moments } from the
// newest done simulation message.
export function sceneForEffect(eff, { picks = [], candidates = [], latestRun = null } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const ids = Array.isArray(picks) ? picks : [];
  if (!eff || eff.panel === "tour") {
    let candidate = null;
    if (eff && eff.candidate_id) {
      candidate = list.find((c) => c && c.id === eff.candidate_id) || null;
    }
    if (!candidate && eff && eff.home) {
      const at = "ABC".indexOf(eff.home);
      const id = at >= 0 ? ids[at] : null;
      if (id) candidate = list.find((c) => c && c.id === id) || null;
    }
    if (!candidate && ids.length > 0) {
      candidate = list.find((c) => c && c.id === ids[0]) || null;
    }
    if (!candidate || !candidate.scene) {
      return { say: "이 집은 아직 3D 동네 자료가 없어요." };
    }
    return { url: tourUrl({ area: candidate.scene, embed: true }),
      title: `${displayNameFor(candidate)} 동네` };
  }
  if (!latestRun || !latestRun.customId) {
    return { say: "먼저 두 집을 찜하고 살아 보기를 맡겨 주세요." };
  }
  const home = (eff && eff.home) || "A";
  const m = ((latestRun && latestRun.moments) || []).find((x) => x && x.label === home) || null;
  const day = (eff && eff.day) || (m && m.day) || 1;
  const t = (eff && eff.time) || (m && m.t) || "08:30";
  const title = eff.panel === "commute" ? `${home} 출근길` : `${home} · ${day}일째 ${t}`;
  return { url: simMomentUrl({ custom: latestRun.customId,
    home, day, t, follow: 1, embed: true }), title };
}

export function latestDoneRun(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m && m.kind === "simulation" && m.data && m.data.status === "done" && m.data.customId) {
      return { customId: m.data.customId, moments: m.data.moments || [] };
    }
  }
  return null;
}

// 27b2: next-step chips — Muse's suggestions on the latest assistant
// message win; otherwise the rule chips.
export function chipsForLatest(messages, fallback) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "assistant") {
      return Array.isArray(m.suggestions) && m.suggestions.length > 0 ? [...m.suggestions] : fallback;
    }
  }
  return fallback;
}

// 30g: the "기록된 대화 보기" replay entry lives as the first suggestion
// chip (above the composer), never below it. Same condition the old
// bottom fallback used: Muse failed, or the off/keyless notice is on
// screen, and no replay is open. Pure; unit-tested.
export const REPLAY_CHIP_LABEL = "기록된 대화 보기";

export function replayChipVisible({ museFails = 0, messages = [], replayId = null } = {}) {
  if (replayId) return false;
  if (museFails > 0) return true;
  return (messages || []).some((m) => m && (m.content === STATIC_OFF_LINE
    || (typeof KEYLESS_LINE === "string" && m.content === KEYLESS_LINE)));
}

// 32a: the composer drawer element (pure over thread state) — the
// suggestion chips with the replay entry first, wrapping, never
// clipped. Null while folded. Rendered into ChatComposer's drawer.
export function suggestionDrawerFor({ messages, chipsNearBottom, museFails,
  replayId, profile, onSend, onAction, onReplay, open, onOpenChange }) {
  const fallback = chatChipsFor(profile && profile.currency && profile.currency.value);
  const chips = chipsForLatest(messages || [], fallback);
  const live = chips !== fallback;
  const showReplay = replayChipVisible({ museFails, messages, replayId });
  const count = chips.length + (showReplay ? 1 : 0);
  if (!((messages || []).length > 0 && chipsNearBottom && count > 0)) return null;
  // 32a2: controlled when the shell owns the open state (starts
  // collapsed with the count summary); uncontrolled otherwise.
  return (
    <ChatComposerDrawer label="이어서 해 볼 것" count={count}
      isCollapsed={onOpenChange ? !open : undefined}
      onCollapsedChange={onOpenChange ? (c) => onOpenChange(!c) : undefined}>
      <div className="ui-chat-chips" role="group" aria-label="추천 질문">
        {showReplay && (
          <Button key="__replay__" size="sm" variant="secondary"
            label={REPLAY_CHIP_LABEL} onClick={onReplay} />
        )}
        {chips.map((chip) => (
          <Button key={chip} size="sm" variant="secondary" label={chip}
            onClick={() => (live ? onSend(chip) : onAction(chip))} />
        ))}
      </div>
    </ChatComposerDrawer>
  );
}

// 32a: the replay notice — Banner (info) with the recorded-conversation
// text and the Skip / Try-it-yourself actions.
export function ReplayNotice({ replayMeta, onSkip, onExit }) {
  const title = currentLang() === "en"
    ? `Recorded conversation · real ${replayMeta && replayMeta.model ? String(replayMeta.model) : ""} answers from ${replayMeta && replayMeta.recordedAt ? String(replayMeta.recordedAt) : ""} · plays without a key`
    : `기록된 대화 · ${replayMeta && replayMeta.recordedAt ? String(replayMeta.recordedAt) : ""} ${replayMeta && replayMeta.model ? String(replayMeta.model) : ""} 실제 답변 · 키 없이 재생`;
  return (
    <Banner status="info" title={title}
      endContent={(
        <HStack gap={1}>
          <Button size="sm" variant="ghost" label="건너뛰기" onClick={onSkip} />
          <Button size="sm" variant="secondary" label="직접 해 보기" onClick={onExit} />
        </HStack>
      )} />
  );
}

// 32a: the thread's message list — top-aligned, so a new conversation
// starts at the top instead of bottom-aligning into empty space.
export function ThreadList({ children }) {
  return (
    <ChatMessageList density="compact" align="top">{children}</ChatMessageList>
  );
}

const US_NO_JEONSE_SUPPORT = "미국 자료에는 전세·공공임대·지원 제도 정보가 없어요.";

const GREETING = [
  "안녕하세요! 집 찾기를 도와드려요.",
  "어디로 출근하고, 누구와 살고, 예산은 얼마인지 편하게 말씀해 주세요.",
  "말씀하신 값으로만 후보를 찾고, 빠진 것은 물어봐요.",
].join("\n");

const NO_KEY_NOTICE = "이 질문은 개발 서버 + 키에서 답해요 (기록된 화면에서는 물음에 답만 해요). 상황·후보·살아 보기는 키 없이도 돼요.";
const STATIC_OFF_LINE = "공개 사이트에서는 Muse와 대화하기가 꺼져 있어요 (키 보호). 조건 읽기·후보·30일 살아 보기는 그대로 돼요.";

// --- ?agent=1 card for sim/tour screens (replaces the floating panel) ---------------------

export function AgentTourCard() {
  if (typeof window === "undefined") return null;
  let ask = null;
  try {
    ask = new URLSearchParams(window.location.search).get("ask");
  } catch {
    return null;
  }
  const rec = ask ? recordedReplyFor(ask) : null;
  return (
    <div className="ui-agenttour overlay">
      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={1} vAlign="center">
            <Heading level={4}>상담</Heading>
            {rec && <Text type="supporting">기록된 답변</Text>}
          </HStack>
          {rec ? (
            <VStack gap={1}>
              <Text>{rec.q}</Text>
              <Text type="supporting">{rec.a}</Text>
            </VStack>
          ) : (
            <Text type="supporting">{GREETING}</Text>
          )}
          <Button size="sm" label="대화에서 계속하기"
            onClick={() => { window.location.href = chatUrl(rec ? rec.q : "", ask ? { ask } : {}); }} />
        </VStack>
      </Card>
    </div>
  );
}

// --- helpers (pure, tested) -----------------------------------------------------------------

export function regionWordsIn(text, aliases) {
  const src = String(text || "");
  const lower = src.toLowerCase();
  const found = [];
  for (const words of Object.values(aliases || {})) {
    for (const w of words || []) {
      if (!w) continue;
      // 26c: Latin words match case-insensitively ("Menlo Park"
      // hits "menlo park"); Korean behaviour is unchanged.
      if (/[a-zA-Z]/.test(w)) {
        if (lower.includes(String(w).toLowerCase())) found.push(w);
      } else if (src.includes(w)) {
        found.push(w);
      }
    }
  }
  return [...new Set(found)];
}

function profileHasValues(profile) {
  return fieldRows(profile).some((r) => r.text !== "아직");
}

function firstMomentOfRun(run) {
  const household = (run.agents || []).find((a) => a.household);
  const key = household ? household.key : "h1";
  const outings = outingsFor({ run, agentKey: key, day: 0 });
  if (outings.length === 0) return { day: 1, t: "08:30", follow: 1 };
  return { day: 1, t: hhmm(outings[0].start), follow: 1 };
}

// 19i: a 살아-보니 row's own "3D로 보기" URL. Moments carry a 0-based
// day, so the customer-facing day is t.day + 1 ("3일차" → day=3).
// Older recorded payloads keep only { home, when_ko, text_ko }: those
// fall back to the per-home first outing (fallback, else firstMomentOfRun
// off runs), exactly the old link.
function followOfRun(runs, t) {
  const run = (runs && t && runs[t.home]) || null;
  const keys = run ? (run.agents || []).filter((a) => a.household).map((a) => a.key) : [];
  const i = t ? keys.indexOf(t.agent) : -1;
  return i >= 0 ? i + 1 : 1;
}

export function momentRowUrl(t, { custom = null, scenario = null, runs = null, fallback = null, embed = false } = {}) {
  if (!t) return null;
  if (Number.isFinite(t.day) && Number.isFinite(t.minute)) {
    return simMomentUrl({ custom, scenario, home: t.home,
      day: t.day + 1, t: hhmm(t.minute), follow: followOfRun(runs, t), embed });
  }
  const mo = fallback
    || (runs && runs[t.home] ? { label: t.home, ...firstMomentOfRun(runs[t.home]) } : null);
  if (!mo) return null;
  return simMomentUrl({ custom, scenario, home: mo.label || t.home,
    day: mo.day, t: mo.t, follow: mo.follow, embed });
}

// 21b: the pure thread update behind pushMsg — append, or replace
// the latest card of a state kind. The intake card always shows the
// latest 고객님 상황, so pushing it drops any standalone profile
// card, and a standalone profile card never joins an intake card:
// the 상황 card renders once (the latest).
export function nextChatMessages(prev, msg, id) {
  const list = Array.isArray(prev) ? prev : [];
  // 13: a stable id renders once — the greeting can never double.
  if (msg.id && list.some((m) => m.id === msg.id)) return list;
  let next = list;
  if (msg.kind === "intake" && msg.replace) {
    const filtered = list.filter((m) => !(m.kind === "profile" && m.role === "assistant"));
    if (filtered.length !== list.length) next = filtered;
  }
  if (msg.kind === "profile" && msg.replace
    && next.some((m) => m.kind === "intake" && m.role === "assistant")) {
    return next;
  }
  if (msg.replace && ["profile", "candidates", "simulation", "intake"].includes(msg.kind)) {
    const at = next.findIndex((m) => m.kind === msg.kind && m.role === "assistant");
    if (at >= 0) {
      const upd = [...next];
      upd[at] = { ...msg, id };
      return upd;
    }
  }
  return [...next, { ...msg, id }];
}

// --- the screen -------------------------------------------------------------------------------

export function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [toolRows, setToolRows] = useState({});
  const [profile, setProfile] = useState(null);
  const [candidatesData, setCandidatesData] = useState(null);
  const [picks, setPicks] = useState([]);
  const [exampleId, setExampleId] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState("");
  // 29b: voice input caption under the composer (done / error, 4 s).
  const [voiceNote, setVoiceNote] = useState("");
  const voiceNoteTimer = useRef(null);
  function flashVoiceNote(text) {
    setVoiceNote(text || "");
    if (voiceNoteTimer.current) clearTimeout(voiceNoteTimer.current);
    if (text) {
      voiceNoteTimer.current = setTimeout(() => setVoiceNote(""), 4000);
    }
  }
  // 29b: the transcript goes into the composer for the customer to
  // check — never auto-sent. Append with a space when text exists.
  function appendVoiceText(text) {
    const t = String(text || "").trim();
    if (!t) return;
    setComposer((prev) => (prev && String(prev).trim() ? `${prev} ${t}` : t));
    flashVoiceNote(VOICE_DONE_NOTE);
  }
  function voiceNoteFor(kind) {
    flashVoiceNote(kind === "done" ? VOICE_DONE_NOTE : VOICE_ERROR_NOTE);
  }
  // 29a6: recorded replay — keyless step-by-step playback, never the consult client.
  const [replayId, setReplayId] = useState(null);
  const [replayMeta, setReplayMeta] = useState(null);
  const [replaying, setReplaying] = useState(false);
  // 29b: mic button only with a recorder, a server voice key, and an
  // idle composer — never in replay mode or while busy.
  const canVoice = !busy && !replayId && voiceSupported()
    && voiceKeyReady(getMuseStatus());
  const replayTimers = useRef([]);
  const replayDoc = useRef(null);
  // 29a4: suggestion chips fold while the customer reads up-thread.
  const [chipsNearBottom, setChipsNearBottom] = useState(true);
  // 31d: whether the reader is at the bottom — the pin decision for
  // content that grows after the message lands (streaming text, cards
  // finishing, the replay-done row). A plain ref, never a re-render.
  const pinRef = useRef(true);
  // 27j: straight Muse failures (3 → rules answer); liveRows → the busy bubble rows.
  const [museFails, setMuseFails] = useState(0);
  // 30b: tri-state key status (one fetch per page load, shared with the
  // header badge). false = keyless: the rule flow answers, never consult.
  const museLive = useSyncExternalStore(subscribeMuseLive, getMuseLive,
    () => (LIVE_API ? null : false));
  useEffect(() => { refreshMuseLive().catch(() => {}); }, []);
  const [liveRows, setLiveRows] = useState([]);
  const [error, setError] = useState("");
  // 13f: usage lives in the 설정 sheet's 모델 section (usage log).
  const [usageLog, setUsageLog] = useState(() => newUsageLog());
  const [provider, setProvider] = useState("meta");
  const [view, setView] = useState("chat");
  // 32a2: the composer drawer starts collapsed with its count summary;
  // a used chip folds it again.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 26p: phones show the pane toggle (대화 / 지도·후보) on its own row
  // under the top bar; wider screens keep it inside the bar (extra).
  // SSR-safe (false on the server), so SSR keeps the in-bar toggle.
  const phone = usePhoneMedia();
  // 32a: the tab layout's single breakpoint (900 px) — the toggle,
  // the stacked panes and the result/card routing all follow this.
  const narrow = useNarrowMedia();
  const [workOpen, setWorkOpen] = useState(false);
  // 32a: full-map mode — the thread hides so the stage fills the
  // width. Esc returns. Not offered at ≤ 900 px (the tabs do this).
  const [fullMap, setFullMap] = useState(false);
  useEffect(() => {
    if (!fullMap || typeof window === "undefined") return undefined;
    const onKey = (e) => { if (e && e.key === "Escape") setFullMap(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullMap]);
  // 32a2: the thread panel starts at 36% of the split container with
  // a 380 px floor and resizes 320–720 px by mouse and keyboard. The
  // percentage resolves once against the split container (containerRef),
  // never the viewport; the hook persists the choice as "ithaca-thread".
  // At ≤ 900 px the pane is full width (no width style, no handle), so
  // nothing narrow is ever measured or saved.
  const splitRef = useRef(null);
  const threadResize = useResizable({
    containerRef: splitRef,
    defaultSize: percent(36, { min: pixel(380) }),
    minSize: THREAD_WIDTH_MIN,
    maxSize: THREAD_WIDTH_MAX,
    autoSaveId: "ithaca-thread",
  });
  const threadWidth = threadResize.size != null
    ? `${threadResize.size}px` : "clamp(380px, 36%, 600px)";
  const [dataTick, setDataTick] = useState(0);
  void dataTick;
  // 27g: the Muse path fills dataRef without re-rendering — refilling it
  // must kick a re-render so the map shows right after the search.
  useEffect(() => {
    if (workOpen && !dataRef.current) {
      ensureData(null).then(() => setDataTick((t) => t + 1)).catch(() => {});
    }
  }, [workOpen]);
  // 27c1: the embedded 3D scene ({ url, title } | null) shown in the
  // work panel instead of the map while set.
  const [scene, setScene] = useState(null);
  const [serverKeys, setServerKeys] = useState({});
  const [modelErrors, setModelErrors] = useState({});
  const [intake, setIntake] = useState(() => intakeState0());
  const [household, setHousehold] = useState(() => household0());
  const [overrides, setOverrides] = useState(() => defaultOverrides());
  const [namedPhotos, setNamedPhotos] = useState(null);
  const [cardHi, setCardHi] = useState(null);
  // 18: corridor ground tiles (real 시군구 boundaries + open water)
  // intersecting the current pins; the map paints fine without them.
  const [mapTiles, setMapTiles] = useState([]);
  useEffect(() => {
    const cands = (candidatesData && candidatesData.result
      && candidatesData.result.candidates) || [];
    const pts = cands.filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat));
    if (pts.length === 0) { setMapTiles([]); return undefined; }
    const lons = pts.map((c) => c.lon);
    const lats = pts.map((c) => c.lat);
    const pad = 0.03;
    const bbox = [Math.min(...lons) - pad, Math.min(...lats) - pad,
      Math.max(...lons) + pad, Math.max(...lats) + pad];
    let stale = false;
    loadCorridorTiles(fetchJson, bbox).then((tiles) => {
      if (!stale) setMapTiles(tiles || []);
    });
    return () => { stale = true; };
  }, [candidatesData]);
  const idRef = useRef(0);
  const busyRef = useRef(false);
  const replyCountRef = useRef(0);
  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const dataRef = useRef(null); // {index, network, schedule, manifest, regionsKey}
  const stateRef = useRef({ messages, toolRows, profile, candidatesData, picks, exampleId, scenario });
  stateRef.current = { messages, toolRows, profile, candidatesData, picks, exampleId, scenario,
    intake, household, overrides, usageLog };
  const viewChip = useSyncExternalStore(store.subscribe,
    () => selectState(store.getState()).viewChip,
    () => selectState(store.getState()).viewChip);

  const nextId = () => {
    idRef.current += 1;
    return `m${idRef.current}`;
  };

  // Append, or replace the latest card of a state kind (profile /
  // candidates / simulation always show the latest state).
  const pushMsg = (msg) => {
    const id = msg.id || nextId();
    if (msg.role !== "user") replyCountRef.current += 1;
    setMessages((prev) => nextChatMessages(prev, msg, id));
    return id;
  };

  const addToolRow = (row) => {
    const id = row.id || nextId();
    setToolRows((prev) => ({ ...prev, [id]: { ...row, id } }));
    return id;
  };

  // 30b: keyless servers say so once per session (never per turn).
  const keylessNoticedRef = useRef(false);
  const noticeKeylessOnce = () => {
    if (keylessNoticedRef.current) return;
    keylessNoticedRef.current = true;
    pushMsg({ role: "system", kind: "system", content: KEYLESS_LINE });
  };

  // --- data (loaded once, cached) ---
  const fetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  };
  const fetchText = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.text();
  };

  // 29g2: replay / restored transcripts never ran a search, so the map
  // data (regions doc + subway network) was never loaded — load it from
  // the saved document and re-render the map.
  function loadDataFor(doc) {
    ensureData(regionsForDoc(doc)).then(() => setDataTick((t) => t + 1)).catch(() => {});
  }
  async function ensureData(regions) {
    const key = (regions || []).join(",") || "all";
    if (dataRef.current && dataRef.current.regionsKey === key) return dataRef.current;
    const [index, network, schedule, manifest, named, regionsDoc] = await Promise.all([
      loadHomesIndex(fetchJson, regions && regions.length > 0 ? regions : null),
      loadNetwork(fetchJson),
      loadSchedule(fetchText),
      loadPhotosManifest(fetchJson),
      loadNamedPhotos(fetchJson),
      loadRegions(fetchJson),
    ]);
    setNamedPhotos(named);
    dataRef.current = { index, network, schedule, manifest, named, regionsDoc, regionsKey: key };
    return dataRef.current;
  }

  // --- structured flow ---
  async function structuredFlow(text) {
    // 30c: typed picks/runs while candidates are on screen — the same
    // state the Pick buttons and tray run button use, no
    // extract_profile, no profile change.
    const onScreen = (((stateRef.current.candidatesData || {}).result || {})
      .candidates) || [];
    if (onScreen.length > 0) {
      const plan = ruleTurnPlan(
        { text, candidates: onScreen, picks: stateRef.current.picks });
      if (plan) {
        if (plan.type === "pick") {
          setPicks(plan.ids);
          stateRef.current.picks = plan.ids;
          pushMsg({ role: "assistant", kind: "text", content: plan.message });
          if (plan.thenRun) {
            if (plan.runReady) await handleRun(plan.ids);
            else pushMsg({ role: "assistant", kind: "text", content: plan.gate });
          }
        } else if (plan.type === "run") {
          await handleRun(plan.ids);
        } else if (plan.type === "gate") {
          pushMsg({ role: "assistant", kind: "text", content: plan.message });
        }
        return;
      }
    }
    const words = regionWordsIn(text, REGION_NAME_ALIASES);
    let named = words.length > 0 ? regionsForNames(words) : null;
    // 26c: a US search loads exactly us-menlo — never Korean regions.
    // A pre-read of this turn decides it (the full extract follows once
    // the data is in); a USD profile from an earlier turn counts too.
    const pre = extractStep(text, stateRef.current.profile, []);
    const preProfile = pre.value && pre.value.profile;
    const preCurrency = preProfile && preProfile.currency
      ? preProfile.currency.value : null;
    if ((named && named.includes("us-menlo")) || preCurrency === "USD") {
      named = ["us-menlo"];
    }
    const data = await ensureData(named);
    // The evidence guard is per call (same as the server tool), so
    // every turn re-reads the accumulated customer words.
    const joined = [...stateRef.current.messages
      .filter((m) => m.role === "user" && m.content)
      .map((m) => m.content), text].join("\n");
    const ex = extractStep(joined, stateRef.current.profile, stationNames(data.network));
    const exId = addToolRow({ name: "extract_profile", ok: ex.value.ok,
      summary: ex.value.ok ? "" : "읽기 실패", ms: ex.ms });
    if (!ex.value.ok) {
      pushMsg({ role: "assistant", kind: "text",
        content: `말씀을 숫자로 옮기지 못했어요: ${ex.value.errors.join("; ")}`,
        tool_calls: [{ id: exId, name: "extract_profile" }] });
      return;
    }
    const prof = ex.value.profile;
    setProfile(prof);
    store.set({ chatSummary: profileSummary(prof) });
    if (!profileHasValues(prof)) {
      pushMsg({ role: "assistant", kind: "profile", replace: true,
        data: { profile: prof }, example: stateRef.current.exampleId,
        tool_calls: [{ id: exId, name: "extract_profile" }] });
      pushMsg({ role: "assistant", kind: "text",
        content: "어떤 상황인지 조금만 더 알려주세요. 예를 들어 어디로 출근하는지, 전세·월세 중 뭘 보는지, 예산은 얼마인지요." });
      return;
    }
    // 26e: USD profiles skip the six-step intake and search directly
    // with the same profile card the empty-profile path uses above; a
    // missing budget is asked by the existing one-question-at-a-time path.
    if (prof.currency && prof.currency.value === "USD") {
      pushMsg({ role: "assistant", kind: "profile", replace: true,
        data: { profile: prof }, example: stateRef.current.exampleId,
        tool_calls: [{ id: exId, name: "extract_profile" }] });
      await runSearch(prof, data, { sort: "commute" });
      return;
    }
    // 13: after the first message the guided intake pre-fills from the
    // extract and walks the six steps as inline answer cards.
    // 21b: one 상황 card — the intake card already shows the latest
    // profile, so no standalone profile card joins it.
    setIntake(prefillFromExtract(intake, { profile: prof }));
    // 29a3: a couple sentence starts with the spouse pre-filled.
    setHousehold(householdFromExtract({ profile: prof }));
    pushMsg({ role: "assistant", kind: "profile", replace: true,
      data: { profile: prof }, example: stateRef.current.exampleId,
      tool_calls: [{ id: exId, name: "extract_profile" }] });
    await runSearch(prof, data, { sort: "commute" });
  }

  // Merge an intake patch into the profile as customer values.
  function applyIntakePatch(prof, patch) {
    const next = { ...(prof || {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) continue;
      next[key] = { value, source: "customer" };
    }
    return next;
  }

  const researchTimer = useRef(null);

  function liveResearch(prof) {
    if (researchTimer.current) clearTimeout(researchTimer.current);
    researchTimer.current = setTimeout(async () => {
      if (!dataRef.current || busyRef.current) return;
      const before = stateRef.current.candidatesData
        ? stateRef.current.candidatesData.result.total_matching : null;
      busyRef.current = true;
      try {
        await runSearch(prof, dataRef.current, { sort: stateRef.current.candidatesData?.sort || "commute" });
        const after = stateRef.current.candidatesData.result.total_matching;
        if (before !== null && before !== after) {
          toast.show(`조건 바뀜 · 후보 ${before}곳 → ${after}곳`);
        }
      } finally {
        busyRef.current = false;
      }
    }, 400);
  }

  function handleIntakeAnswer(step, value, keep = false) {
    if ((value === null || value === undefined) && keep) return;
    const said = keep ? Boolean(intake.said[step]) : false;
    const next = answerStep(intake, step, value, said);
    setIntake(next);
    const patch = intakeToProfilePatch(next, household);
    const merged = applyIntakePatch(profileRef.current, patch);
    profileRef.current = merged;
    setProfile(merged);
    store.set({ chatSummary: profileSummary(merged) });
    liveResearch(merged);
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {} });
  }

  // 31h: map filter chips re-run the search through the same intake
  // path (patch → applyIntakePatch → store → liveResearch, so the
  // 조건 바뀜 toast confirms it). A null patch value clears its
  // field — applyIntakePatch skips nulls, so cleared keys are
  // deleted from the merged profile after the merge.
  function handleFilterChange(patch) {
    const clean = {};
    const clears = [];
    for (const [key, value] of Object.entries(patch || {})) {
      if (value === null || value === undefined) clears.push(key);
      else clean[key] = value;
    }
    const merged = applyIntakePatch(profileRef.current, clean);
    for (const key of clears) delete merged[key];
    profileRef.current = merged;
    setProfile(merged);
    store.set({ chatSummary: profileSummary(merged) });
    liveResearch(merged);
  }

  function handleIntakeSkip(step) {
    setIntake(skipStep(intake, step));
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {} });
  }

  function handleHouseholdAdd(member) {
    const r = addMember(household, member);
    if (!r.ok) return r;
    setHousehold(r.household);
    setProfile((prof) => {
      const patch = intakeToProfilePatch(intake, r.household);
      // 29a3: a member commute cap settles the profile ceiling too.
      const merged = applyIntakePatch(prof, { members: patch.members, commuteMax: patch.commuteMax });
      store.set({ chatSummary: profileSummary(merged) });
      return merged;
    });
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {} });
    return r;
  }

  function handleHouseholdRemove(index) {
    const next = removeMember(household, index);
    setHousehold(next);
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {} });
  }

  // 29a3: profile summary the last search ran with — a newer
  // profile means "조건이 바뀌었어요" until 다시 찾기 runs again.
  const lastSearchRef = useRef("");
  async function runSearch(prof, data, { sort }) {
    lastSearchRef.current = profileSummary(prof);
    const tenure = (prof.tenure && prof.tenure.value) || "undecided";
    const t0 = Date.now();
    let result = searchStep(prof, data.index, data, { sort, limit: 6 }).value;
    // Second pass with box graphs only when must-haves need measuring.
    const mustHaves = (prof.mustHaves && prof.mustHaves.value) || [];
    if (mustHaves.length > 0) {
      result = await searchWithBoxes(fetchJson, prof, data.index, result, data, { sort, limit: 6 });
    }
    // 21a: the customer's own housing-type words filter the list (kept
    // when at least 3 remain, else filled + labelled).
    result = { ...result,
      candidates: applyKindPreference(result.candidates, profileHomeKinds(prof)) };
    const ms = Date.now() - t0;
    const rowId = addToolRow({ name: "find_homes", ok: true,
      summary: `${result.candidates.length}곳 · ${HOME_SORT_KO[sort]}`, ms });
    // A new search drops picks that are no longer listed.
    setPicks((prev) => prev.filter((id) => result.candidates.some((c) => c.id === id)));
    // 26k: a USD search with no homes names the cheapest loaded ZIP
    // rent (computed from the loaded homes, never hardcoded).
    const profCur = prof.currency && prof.currency.value;
    const budget = profCur === "USD" && prof.monthlyMax
      ? Number(prof.monthlyMax.value) : null;
    const emptyHint = usEmptyHint((data.index && data.index.homes) || [], budget);
    setCandidatesData({ result, tenure, sort });
    setWorkOpen(true);
    pushMsg({ role: "assistant", kind: "candidates", replace: true,
      data: { result, tenure, sort, emptyHint }, example: stateRef.current.exampleId,
      tool_calls: [{ id: rowId, name: "find_homes" }] });
  }

  async function handleSort(msgId, sort) {
    if (busyRef.current) return;
    const st = stateRef.current;
    if (!st.profile || !dataRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await runSearch(st.profile, dataRef.current, { sort });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleTogglePick(candidate) {
    setPicks((prev) => {
      if (prev.includes(candidate.id)) return prev.filter((id) => id !== candidate.id);
      if (prev.length >= 3) {
        pushMsg({ role: "system", kind: "system", content: "3곳까지 고를 수 있어요" });
        return prev;
      }
      return [...prev, candidate.id];
    });
  }

  function handlePreview3D(candidate) {
    if (!candidate.scene) return;
    setScene({ url: tourUrl({ area: candidate.scene, embed: true }),
      title: `${displayNameFor(candidate)} 동네` });
    setWorkOpen(true);
    setView("work");
  }

  function handleJeonse() {
    store.set({ compareOpen: true, compareTab: "jeonse" });
    pushMsg({ role: "assistant", kind: "text",
      content: "전세 점검 탭을 작업 영역에 열었어요. 후보 카드의 ’보증금이 집값의 몇 %인지’도 함께 보세요." });
  }

  // 21a: the tray's inline workplace box. A bare station/동네 name
  // resolves against the station list; a full sentence goes through
  // the parser. Returns whether the run gate now passes.
  function handleTrayWorkplace(raw) {
    const text = String(raw || "").trim();
    if (!text) return false;
    const data = dataRef.current;
    const stations = data && data.network ? stationNames(data.network) : [];
    const want = text.replace(/역$/, "").trim();
    const hit = stations.find((s) => s === want || s === text || `${s}역` === text) || null;
    let entry = null;
    if (hit) {
      entry = { member: 0, text, resolved: { station: hit } };
    } else {
      const ex = extractStep(text, stateRef.current.profile, stations);
      const prof = ex.value.profile || {};
      const wps = prof.workplaces ? prof.workplaces.value : null;
      const w = Array.isArray(wps) && wps[0] ? wps[0] : null;
      if (w && w.resolved && (w.resolved.station || w.resolved.place)) entry = w;
    }
    if (!entry) return false;
    const next = { ...(stateRef.current.profile || {}),
      workplaces: { value: [entry], source: "customer",
        note: entry.resolved.station ? `직장 근처역: ${entry.resolved.station}`
          : `직장: ${entry.resolved.place.name}` } };
    profileRef.current = next;
    setProfile(next);
    store.set({ chatSummary: profileSummary(next) });
    liveResearch(next);
    return true;
  }

  function handleTrayNoCommute() {
    const next = { ...(stateRef.current.profile || {}),
      workplaces: { value: [noCommuteEntry()], source: "customer",
        note: "출근 안 해요" } };
    profileRef.current = next;
    setProfile(next);
    store.set({ chatSummary: profileSummary(next) });
    liveResearch(next);
  }

  async function handleRun(idsOverride = null) {
    setWorkOpen(true);
    const st = stateRef.current;
    const ids = Array.isArray(idsOverride) ? idsOverride : st.picks;
    const picked = ((st.candidatesData && st.candidatesData.result.candidates) || [])
      .filter((c) => ids.includes(c.id));
    if (picked.length < 2 || !st.profile) return;
    // 21a: no run without a commute — unless the customer chose none.
    const gate = runGate(st.profile);
    if (!gate.ok) {
      pushMsg({ role: "assistant", kind: "text",
        content: "회사 위치를 먼저 알려 주세요. 회사 근처 역이나 동네를 말씀해 주시면 그 길로 30일 살아 보기를 돌려요. 출근을 안 하시면 “출근 안 해요”라고 말씀해 주세요." });
      return;
    }
    const noCommute = gate.noCommute === true;
    const blocked = picked.filter((c) => readinessNote(c));
    if (blocked.length > 0) {
      pushMsg({ role: "assistant", kind: "text",
        content: `살아 보기를 못 하는 집이 있어요: ${blocked.map((c) => `${displayNameFor(c)} (${readinessNote(c)})`).join(" · ")}` });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const simId = pushMsg({ role: "assistant", kind: "simulation", replace: true,
      data: { status: "running", progress: { done: 0, total: picked.length, label: "" } },
      example: st.exampleId });
    // 18d: the new card renders far below — move the chat there at
    // once so the progress stays visible (the tray's run button
    // funnels through here).
    soon(() => scrollChatToSim(simId));
    const setProgress = (progress) => {
      setMessages((prev) => prev.map((m) => (m.id === simId
        ? { ...m, data: { ...m.data, status: "running", progress } } : m)));
    };
    try {
      const data = dataRef.current || await ensureData(null);
      setProgress({ done: 0, total: picked.length + 1, label: "장면" });
      const areas = new Map();
      for (const p of picked) {
        if (!areas.has(p.scene)) areas.set(p.scene, await loadBoxArea(fetchJson, p.scene));
      }
      // 18: water + park rings out of the picked boxes' landuse (the run
      // needs these area docs anyway) for the stage map's green layer.
      try {
        const cache = (dataRef.current && dataRef.current.greenBoxes)
          || new Map();
        for (const p of picked) {
          if (!p.scene || cache.has(p.scene)) continue;
          const area = areas.get(p.scene);
          if (area && Array.isArray(area.landuse)) {
            cache.set(p.scene, extractGreenRings(area.landuse));
          }
        }
        if (dataRef.current) dataRef.current.greenBoxes = cache;
      } catch {
        // The map paints fine without the green layer.
      }
      const homes = picked.map((p) => homeForScenario(p,
        complexNameForCandidate(p, areas.get(p.scene)) || p.name));
      const sc = await scenarioStep(fetchJson, st.profile, homes, { ...data, areas });
      const scenValue = sc.value;
      setScenario(scenValue);
      const buildId = addToolRow({ name: "build_scenario", ok: true,
        summary: picked.map((p) => displayNameFor(p)).join(" · "), ms: sc.ms });
      const labels = picked.map((_, i) => "ABC"[i]);
      const runner = createWorkerRunner(() => new Worker(new URL("../sim-worker.js", import.meta.url), { type: "module" }));
      const { runs, compare, ms } = await runStep(
        (s, l, onP) => runner(s, l, (pg) => setProgress(
          { done: pg.done + 1, total: picked.length + 1, label: pg.label })),
        scenValue, labels);
      const runId = addToolRow({ name: "run_simulation", ok: true,
        summary: `${noCommute ? "출근 없이 · " : ""}30일 · ${labels.join("·")}`, ms });
      const cmpId = addToolRow({ name: "compare", ok: true,
        summary: `${compare.metrics.length}개 지표`, ms: 0 });
      // 18: the run's own money doc, built in the browser from the
      // picked candidates' 실거래 — never another scenario's file.
      // A build failure keeps the 30-day runs and reports the money
      // as missing (with its reason), never demo numbers.
      setProgress({ done: picked.length + 1, total: picked.length + 2, label: "돈 계산" });
      let moneyDoc = null;
      let moneyMissing = "";
      // 26d: USD picks skip the Korean payroll table — the money doc
      // is the ZIP-estimate rent per home.
      const usPicks = picked.length > 0 && picked.every((p) => currencyOf(p) === "USD");
      try {
        if (usPicks) {
          moneyDoc = buildUsRentMoneyDoc({
            picked: picked.map((p, i) => ({ label: labels[i], candidate: p,
              complexName: homes[i].name, areaId: p.scene })),
            labels,
          });
        } else {
          const payroll = await loadPayroll(fetchJson);
          if (!payroll) throw new Error("급여 요율표를 불러오지 못했어요");
          moneyDoc = buildCustomMoneyDoc({
            scenario: scenValue, runs, profile: st.profile,
            picked: picked.map((p, i) => ({ label: labels[i], candidate: p,
              complexName: homes[i].name, areaId: p.scene })),
            payrollTable: payroll, areas,
            network: data.network || null, fareSchedule: data.schedule || null,
          });
        }
      } catch (err) {
        moneyMissing = String((err && err.message) || err);
      }
      const customId = newCustomId();
      await saveCustomRun({ id: customId, scenario: scenValue, runs, labels,
        moneyDoc, moneyMissing,
        names: Object.fromEntries(picked.map((p, i) => [labels[i], displayNameFor(p)])) });
      const moments = labels.map((l) => ({ label: l, ...firstMomentOfRun(runs[l]) }));
      const anchors = labels.map((l) => ({ label: l,
        method: (runs[l].meta.home_anchor || {}).method || "complex" }));
      // 18: the 2–3 pickMoments texts read in the summary; the anchor
      // facts moved into the full table's 어떻게 계산했나요.
      let momentTexts = [];
      try {
        if (labels.length >= 2 && runs[labels[0]] && runs[labels[1]]) {
          momentTexts = pickMoments(runs[labels[0]], runs[labels[1]], { max: 3 })
            .map((m) => ({ home: m.home, day: m.day, minute: m.minute,
              agent: m.agent, when_ko: m.when_ko, text_ko: m.text_ko }));
        }
      } catch {
        momentTexts = [];
      }
      // 29c1: seated commutes + late walks home off the same runs.
      let lifeRows = [];
      try {
        if (labels.length >= 2 && runs[labels[0]] && runs[labels[1]]) {
          lifeRows = lifeEvents(runs[labels[0]], runs[labels[1]], { labels });
        }
      } catch {
        lifeRows = [];
      }
      compare.anchors = anchors;
      // 18d: the one customer-facing 출퇴근 편도 per home, straight off
      // the runs (door-to-door minutes per one-way commute = C01). The
      // result card, share card and compare table all read this.
      compare.one_way = oneWayByLabel(
        Object.fromEntries(labels.map((l) => [l, runs[l]])));
      let extraLine = "";
      if (labels.length > 2) {
        const third = runs[labels[2]];
        const hh = third.household || {};
        extraLine = `${labels[2]} ${(third.meta || {}).complex || ""}: `
          + `30일 동안 ${Math.round(hh.walk_minutes || 0)}분 걷고, `
          + `하루 평균 피곤한 정도 ${Math.round((hh.fatigue_avg_30d || 0) * 10) / 10} — 3D에서 보기로 하루를 보세요.`;
      }
      const payload = { status: "done", compare, moments, labels, customId,
        names: Object.fromEntries(picked.map((p, i) => [labels[i], displayNameFor(p)])),
        moneyDoc, moneyMissing, anchors, momentTexts, extraLine, noCommute,
        lifeEvents: lifeRows };
      // The chat drawer tabs read the same custom docs as the sim.
      store.set({ compare });
      if (moneyDoc) {
        store.set({ money: moneyDoc,
          moneyTenure: { ...(moneyDoc.default_tenure || {}) } });
      }
      setMessages((prev) => prev.map((m) => (m.id === simId
        ? { ...m, data: payload,
          tool_calls: [{ id: buildId, name: "build_scenario" },
            { id: runId, name: "run_simulation" }, { id: cmpId, name: "compare" }] }
        : m)));
      // 18d: the finished result replaces the progress in the same
      // card — keep it in view.
      soon(() => scrollChatToSim(simId));
      // 27d: the diary follows without blocking the result card.
      if (LIVE_API) {
        try {
          const digests = labels.map((l) => runDigest(runs[l], l, { name: (payload.names || {})[l] || "" }));
          setMessages((prev) => prev.map((m) => (m.id === simId
            ? { ...m, data: { ...m.data, diary: { status: "writing" } } } : m)));
          postDiary({ provider, digests, lang: LANG }).then((result) => {
            setMessages((prev) => prev.map((m) => (m.id === simId
              ? { ...m, data: { ...m.data, diary: { status: "done", ...result } } } : m)));
            // 26t: the prefix is deterministic; only a model-written
            // summary counts as model text (fallback stays translatable).
            pushMsg({ role: "assistant", kind: "text",
              fromModel: !(result.check && result.check.summary_fallback),
              content: LANG === "en"
                ? `Finished living there. ${result.summary}`
                : `다 살아 봤어요. ${result.summary}`,
              suggestions: ["출근길 보여 줘", "한 달에 얼마 들어?", "동네 걸어 보기"] });
          }).catch(() => {
            setMessages((prev) => prev.map((m) => (m.id === simId
              ? { ...m, data: { ...m.data, diary: { status: "failed" } } } : m)));
            pushMsg({ role: "assistant", kind: "text",
              content: diaryFallbackLine(compare.one_way, payload.names, LANG),
              suggestions: ["출근길 보여 줘", "한 달에 얼마 들어?", "동네 걸어 보기"] });
          });
        } catch {
          setMessages((prev) => prev.map((m) => (m.id === simId
            ? { ...m, data: { ...m.data, diary: { status: "failed" } } } : m)));
          pushMsg({ role: "assistant", kind: "text",
            content: diaryFallbackLine(compare.one_way, payload.names, LANG),
            suggestions: ["출근길 보여 줘", "한 달에 얼마 들어?", "동네 걸어 보기"] });
        }
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === simId
        ? { ...m, data: { status: "error", error: String((err && err.message) || err) } } : m)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // --- live agent (dev key) for free questions + tab-originated checks ---
  async function askAgent(text) {
    if (!LIVE_API) {
      pushMsg({ role: "assistant", kind: "text", content: STATIC_OFF_LINE });
      return;
    }
    const st = stateRef.current;
    let scen = st.scenario;
    if (!scen) {
      try {
        scen = await loadScenario(store.getState().scenarioName || "demo-two-homes");
      } catch (err) {
        pushMsg({ role: "assistant", kind: "text", content: String(err.message) });
        return;
      }
    }
    const history = [
      ...st.messages.filter((m) => m.kind === "text" && m.content)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
      { role: "user", content: text },
    ];
    // 27b2: the context Muse needs — live candidates (real ids for
    // pick_homes), current picks, and whether the work panel is open.
    const liveCands = ((st.candidatesData && st.candidatesData.result
      && st.candidatesData.result.candidates) || []).slice(0, 6).map((c) => ({
      id: c.id, name: c.name, kind: c.kind ?? null, dong: c.dong ?? null,
      commute_ko: c.commute_ko ?? null,
      monthly_cost_won: c.monthly_cost_won ?? null,
      scene: c.scene ?? null, lon: c.lon ?? null, lat: c.lat ?? null,
      ...(c.price !== undefined && c.price !== null ? { price: c.price } : {}),
    }));
    // 29a1: the customer's own words — extract_profile reads these,
    // not Muse's English paraphrase.
    const customer_text = [...st.messages
      .filter((m) => m.role === "user" && m.kind === "text"
        && typeof m.content === "string" && m.content)
      .map((m) => m.content).slice(-6), text];
    const ctx = { ...agentContext(store.getState()), lang: LANG,
      candidates: liveCands,
      picks: st.picks.map((id, i) => ({ label: "ABC"[i], id })),
      work_open: workOpen, profile: st.profile || null, customer_text };
    try {
      let byoKey = "";
      try {
        byoKey = loadByoKey(typeof sessionStorage !== "undefined" ? sessionStorage : null, provider);
      } catch { /* no storage — server key path */ }
      setLiveRows([]);
      const out = await postConsultStream({ provider, messages: history, scenario: scen,
        context: ctx, byoKey }, (ev) => {
        if (ev.type === "tool_start") {
          setLiveRows((prev) => [...prev, { name: ev.name, pending: true }]);
        } else if (ev.type === "tool_end") {
          setLiveRows((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].pending && next[i].name === ev.name) {
                next[i] = { name: ev.name, ok: ev.ok, summary: ev.summary, pending: false };
                break;
              }
            }
            return next;
          });
        }
      });
      setLiveRows([]);
      const rows = { ...stateRef.current.toolRows };
      const callIds = [];
      for (const m of out.messages) {
        for (const c of m.tool_calls || []) callIds.push(c.id);
      }
      (out.toolCalls || []).forEach((t, i) => {
        if (callIds[i]) rows[callIds[i]] = { id: callIds[i], ...t };
      });
      setToolRows(rows);
      const appended = [...out.messages];
      if (out.view) appended.push({ role: "system", content: viewSystemLine(out.view) });
      const suggestions = Array.isArray(out.suggestions) ? out.suggestions : [];
      for (const m of appended) {
        if (m.role === "system") {
          pushMsg({ role: "system", kind: "system", content: m.content });
        }
      }
      const bubble = turnBubble(out);
      // 26t: deterministic fallbacks (numbers-only, action confirmation)
      // stay translatable — only model-written text is fromModel.
      pushMsg({ role: "assistant", kind: "text", content: bubble.content || "",
        tool_calls: bubble.tool_calls, suggestions: [...suggestions],
        fromModel: !out.fallback });
      appendToolCards(out.messages);
      // 27g: the Muse path never ran ensureData, so the map stayed on its
      // placeholder after Muse found homes. Fill it now (no await — the
      // workOpen effect re-renders when it lands).
      if (!dataRef.current) {
        for (const m of out.messages || []) {
          if (!m || m.role !== "tool" || typeof m.content !== "string") continue;
          let r = null;
          try { r = JSON.parse(m.content); } catch { continue; }
          if (r && r.ok === true && Array.isArray(r.candidates)) {
            ensureData(null).then(() => setDataTick((t) => t + 1));
            break;
          }
        }
      }
      mergeMoneyResults(out.messages);
      if (out.scenario) setScenario(out.scenario);
      // 27b2: Muse opens panels and picks — same-turn candidates count,
      // so a find + pick in one turn still lands.
      let candidateIds = (((stateRef.current.candidatesData || {}).result || {}).candidates || [])
        .map((c) => c.id);
      for (const m of appended) {
        if (m && m.role === "tool" && typeof m.content === "string") {
          try {
            const r = JSON.parse(m.content);
            if (r && Array.isArray(r.candidates)) candidateIds = r.candidates.map((c) => c.id);
          } catch { /* not JSON — ignore */ }
        }
      }
      let lastPickIds = null;
      for (const eff of uiEffects(out.uiActions || [],
        { candidateIds, pickCount: stateRef.current.picks.length })) {
        if (eff.type === "work") setWorkOpen(true);
        else if (eff.type === "tab") store.set({ compareOpen: true, compareTab: eff.tab });
        else if (eff.type === "pick") {
          setPicks(eff.ids);
          lastPickIds = eff.ids;
          stateRef.current.picks = eff.ids;
        }
        else if (eff.type === "run") await handleRun(lastPickIds);
        else if (eff.type === "say") {
          pushMsg({ role: "assistant", kind: "text", content: eff.text });
        } else if (eff.type === "scene") store.set({ pendingScene: eff });
      }
      // 13: per-turn usage into the 모델 panel log.
      setUsageLog((log) => recordTurn(log, {
        provider, model: provider,
        input: (out.usage && out.usage.prompt_tokens) || 0,
        output: (out.usage && out.usage.completion_tokens) || 0,
        reasoning: (out.usage && out.usage.reasoning_tokens) || 0,
        latencyMs: out.latencyMs || 0,
      }));
      setModelErrors((e) => ({ ...e, [provider]: null }));
      setMuseFails(0);
    } catch (err) {
      setLiveRows([]);
      // 30b: no server key is not slowness — same rules answer, said
      // once, and the session stays keyless (no 27j counter).
      if (isNoKeyError(err)) {
        setMuseLive(false);
        setModelErrors((e) => ({ ...e, [provider]: {
          httpStatus: err.httpStatus || null, message: String(err.message || err).slice(0, 200),
        } }));
        noticeKeylessOnce();
        await structuredFlow(text);
        return;
      }
      setModelErrors((e) => ({ ...e, [provider]: {
        httpStatus: err.httpStatus || null, message: String(err.message || err).slice(0, 200),
      } }));
      // 27j: count straight failures; Muse gets another chance on the next turn.
      const fails = (typeof museFails === "number" ? museFails : 0) + 1;
      setMuseFails(fails);
      if (err && err.httpStatus === 429) {
        pushMsg({ role: "system", kind: "system", content: "오늘 Muse 사용 한도에 닿았어요. 기록된 대화로 보시거나 내일 다시 와 주세요." });
      } else {
        pushMsg({ role: "system", kind: "system", content: fails >= 3
          ? "Muse 연결이 계속 안 돼서 규칙으로 이어 갈게요"
          : "Muse 답이 늦어서 이번엔 규칙으로 답했어요. 다시 말하면 Muse가 이어받아요" });
      }
      await structuredFlow(text);
    }
  }

  // Recognised live-tool results render as the same cards.
  function appendToolCards(toolMessages) {
    for (const m of toolMessages || []) {
      if (!m || m.role !== "tool" || typeof m.content !== "string") continue;
      let r = null;
      try {
        r = JSON.parse(m.content);
      } catch {
        continue;
      }
      if (!r || r.ok !== true) continue;
      if (r.profile && r.candidates === undefined) {
        setProfile(r.profile);
        store.set({ chatSummary: profileSummary(r.profile) });
        pushMsg({ role: "assistant", kind: "profile", replace: true,
          data: { profile: r.profile }, example: stateRef.current.exampleId });
      } else if (Array.isArray(r.candidates)) {
        setCandidatesData({ result: r, tenure: r.tenure || "undecided", sort: r.sort || "commute" });
        setWorkOpen(true);
        pushMsg({ role: "assistant", kind: "candidates", replace: true,
          data: { result: r, tenure: r.tenure || "undecided", sort: r.sort || "commute" },
          example: stateRef.current.exampleId });
      } else if (Array.isArray(r.metrics)) {
        pushMsg({ role: "assistant", kind: "simulation", replace: true,
          data: { status: "done", compare: r, moments: [], labels: ["A", "B"],
            names: {}, anchors: [], customId: null,
            extraLine: "상담에서 계산한 비교예요. 3D로 보는 건 이 화면의 ’살아 보기’에서 돼요." },
          example: stateRef.current.exampleId });
      }
    }
  }

  // --- router ---
  async function send(text) {
    const content = String(text || "").trim();
    if (!content || busyRef.current) return;
    // 29a6: replay mode never calls the consult client — the composer is read-only while replaying.
    if (replayId || replaying) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setChipsNearBottom(true);
    pushMsg({ role: "user", kind: "text", content });
    setComposer("");
    // 27j: the rules path always answers — count replies added after this point.
    const repliesBefore = replyCountRef.current;
    try {
      // 30b: keyless servers say so once, then the rule flow answers.
      if (museLive === false) noticeKeylessOnce();
      if (content === "매물 글 붙여 넣기") {
        pushMsg({ role: "assistant", kind: "listing", data: {} });
      } else if (routeTurn({ live: shouldCallMuse({ museLive }), museFails }) === "agent") {
        await askAgent(content);
      } else if (/check_listing으로 확인해줘|add_listing_c로 C에 추가해줘|C로 추가해줘/.test(content)) {
        pushMsg({ role: "assistant", kind: "text",
          content: "매물 확인은 개발 서버 + 키에서 실거래와 대조해요. 글 읽기는 ’매물 글 붙여 넣기’에서 바로 돼요." });
        pushMsg({ role: "assistant", kind: "listing", data: {} });
      } else if (/공공임대/.test(content)) {
        // 26e: USD runs have no jeonse/public/support data — one line,
        // never the tabs.
        const usd = stateRef.current.profile
          && stateRef.current.profile.currency
          && stateRef.current.profile.currency.value === "USD";
        if (usd) {
          pushMsg({ role: "assistant", kind: "text", content: US_NO_JEONSE_SUPPORT });
        } else pushMsg({ role: "assistant", kind: "text", content: NO_KEY_NOTICE });
      } else if (/전세 점검/.test(content)) {
        const usd = stateRef.current.profile
          && stateRef.current.profile.currency
          && stateRef.current.profile.currency.value === "USD";
        if (usd) {
          pushMsg({ role: "assistant", kind: "text", content: US_NO_JEONSE_SUPPORT });
        } else {
          store.set({ compareOpen: true, compareTab: "jeonse" });
          pushMsg({ role: "assistant", kind: "tab", data: { tab: "jeonse" } });
        }
      } else if (/살 만한/.test(content)) {
        store.set({ compareOpen: true, compareTab: "worthit" });
        pushMsg({ role: "assistant", kind: "tab", data: { tab: "worthit" } });
      } else if (/도움 제도|도움제도|지원 제도|정책 대출|혜택/.test(content)) {
        const usd = stateRef.current.profile
          && stateRef.current.profile.currency
          && stateRef.current.profile.currency.value === "USD";
        if (usd) {
          pushMsg({ role: "assistant", kind: "text", content: US_NO_JEONSE_SUPPORT });
        } else {
          store.set({ compareOpen: true, compareTab: "support" });
          pushMsg({ role: "assistant", kind: "tab", data: { tab: "support" } });
        }
      } else {
        await structuredFlow(content);
      }
      // 27j: the rules path always answers — fallback line when nothing replied.
      if (routeTurn({ live: shouldCallMuse({ museLive }), museFails }) !== "agent") {
        const answered = answeredSince(replyCountRef.current, repliesBefore);
        if (!answered) {
          pushMsg({ role: "assistant", kind: "text", content: localNoAnswerLine(content) });
        }
      }
    } catch (err) {
      setError(String((err && err.message) || err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function chipAction(chip) {
    if (chip === "매물 글 붙여 넣기") {
      pushMsg({ role: "user", kind: "text", content: chip });
      pushMsg({ role: "assistant", kind: "listing", data: {} });
    } else if (chip === "공공임대 찾기") {
      send("공공임대 찾기");
    } else if (chip === "도움 제도 보여줘") {
      send("도움 제도 보여줘");
    } else if (chip === "Meta HQ까지 가까운 순") {
      // 26e: USD sort chips re-run the search with find_homes sorts.
      handleSort(null, "commute");
    } else if (chip === "월세 낮은 순") {
      handleSort(null, "monthly");
    }
  }

  function handleExample() {
    setExampleId("single-firstjob");
    pushMsg({ role: "system", kind: "system",
      content: exampleLine("single-firstjob") });
    send(EXAMPLE_PROMPTS[0].prompt);
  }

  // 29a6: replay helpers — skip reveals all now, exit keeps the language.
  function replayIdForChat() {
    return LANG === "en" ? "menlo-month" : "seoul-couple";
  }
  function skipReplay() {
    const timers = replayTimers.current || [];
    timers.forEach((t) => clearTimeout(t));
    replayTimers.current = [];
    const doc = replayDoc.current;
    if (doc && Array.isArray(doc.messages)) {
      const shown = new Set((stateRef.current.messages || []).map((m) => m.content));
      doc.messages.forEach((m) => {
        if (m && m.kind === "candidates" && doc.candidatesData) {
          setCandidatesData(doc.candidatesData);
          setWorkOpen(true);
          loadDataFor({ profile: doc.profile, candidatesData: doc.candidatesData });
        }
      });
      setMessages((prev) => {
        const rest = doc.messages.filter((m) => !shown.has(m.content)).map((m) => ({ ...m }));
        if (rest.length === 0) return prev;
        let id = idRef.current || prev.length + 10;
        const stamped = rest.map((m) => ({ ...m, id: id++ }));
        idRef.current = id;
        return [...prev, ...stamped];
      });
    }
    setReplaying(false);
  }
  function exitReplay() {
    const timers = replayTimers.current || [];
    timers.forEach((t) => clearTimeout(t));
    replayTimers.current = [];
    setReplayId(null);
    setReplayMeta(null);
    setReplaying(false);
    setMessages([]);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("replay");
      window.history.replaceState(null, "", u.toString());
    } catch { /* keep the thread as it is */ }
  }
  function openReplay() {
    window.location.href = appUrl("?replay=" + replayIdForChat());
  }

  // --- boot from URL / memory ---
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return; // StrictMode double-mount (dev only)
    booted.current = true;
    let initial = { message: "", area: "", ask: "", example: "", listing: "" };
    try {
      const q = new URLSearchParams(window.location.search);
      initial = { ...parseChatSearch(window.location.search),
        example: q.get("example") || "", listing: q.get("listing") || "" };
    } catch {
      return;
    }
    if (initial.example) setExampleId(initial.example);
    if (initial.ask) {
      const rec = recordedReplyFor(initial.ask);
      if (rec) {
        if (initial.example) setExampleId(initial.example);
        pushMsg({ role: "user", kind: "text", content: rec.q });
        const calls = (rec.tools || []).map((t, i) => {
          const id = addToolRow({ name: t.name, ok: t.ok !== false,
            summary: stripToolLabel(t.name, t.summary), ms: t.ms || 0 });
          return { id, name: t.name };
        });
        pushMsg({ role: "assistant", kind: "text", content: rec.a,
          recorded: true, tool_calls: calls });
        if (initial.example) {
          pushMsg({ role: "system", kind: "system",
            content: exampleLine(initial.example) });
        }
        return;
      }
    }
    if (initial.listing === "1") {
      pushMsg({ role: "assistant", kind: "listing", data: {} });
      return;
    }
    if (initial.message) {
      clearTranscript();
      if (initial.example) {
        pushMsg({ role: "system", kind: "system",
          content: exampleLine(initial.example) });
      }
      send(initial.message);
      return;
    }
    // 29a6: ?replay=<id> — keyless recorded conversation, revealed step by step.
    let replayParam = "";
    try { replayParam = new URLSearchParams(window.location.search).get("replay") || ""; } catch { replayParam = ""; }
    if (replayParam) {
      setReplayId(replayParam);
      setReplaying(true);
      fetch(recordingUrl(replayParam))
        .then((r) => (r.ok ? r.json() : null))
        .then((doc) => {
          const v = validateRecording(doc);
          if (!v.ok || !doc) {
            pushMsg({ role: "system", kind: "system", content: "기록을 불러오지 못했어요 · 직접 해 보기" });
            setReplaying(false);
            return;
          }
          replayDoc.current = doc;
          setReplayMeta(doc.meta || null);
          if (doc.toolRows) setToolRows(doc.toolRows);
          if (doc.profile) { setProfile(doc.profile); store.set({ chatSummary: profileSummary(doc.profile) }); }
          if (doc.household) setHousehold(doc.household);
          if (doc.intake) setIntake(doc.intake);
          if (doc.scenario) setScenario(doc.scenario);
          if (Array.isArray(doc.picks)) setPicks(doc.picks);
          const sched = replaySchedule(doc.messages);
          let t = 0;
          const timers = [];
          doc.messages.forEach((m, i) => {
            t += (sched[i] && sched[i].delayMs) || 1200;
            timers.push(setTimeout(() => {
              pushMsg({ ...m });
              if (m && m.kind === "candidates" && doc.candidatesData) {
                setCandidatesData(doc.candidatesData);
                setWorkOpen(true);
                loadDataFor({ profile: doc.profile, candidatesData: doc.candidatesData });
              }
              if (i === doc.messages.length - 1) setReplaying(false);
            }, t));
          });
          replayTimers.current = timers;
        })
        .catch(() => {
          pushMsg({ role: "system", kind: "system", content: "기록을 불러오지 못했어요 · 직접 해 보기" });
          setReplaying(false);
        });
      return;
    }
    const mem = loadTranscript();
    if (mem && mem.messages && mem.messages.length > 0) {
      idRef.current = mem.messages.length + 10;
      setMessages(mem.messages);
      setToolRows(mem.toolRows || {});
      if (mem.profile) {
        setProfile(mem.profile);
        store.set({ chatSummary: profileSummary(mem.profile) });
      }
      if (mem.candidatesData) {
        setCandidatesData(mem.candidatesData);
        setWorkOpen(true);
        loadDataFor({ profile: mem.profile, candidatesData: mem.candidatesData });
      }
      if (Array.isArray(mem.picks)) setPicks(mem.picks);
      if (mem.exampleId) setExampleId(mem.exampleId);
      if (mem.scenario) setScenario(mem.scenario);
      if (mem.intake) setIntake(mem.intake);
      if (mem.household) setHousehold(mem.household);
      if (mem.overrides) setOverrides(mem.overrides);
      if (mem.usageLog) setUsageLog(mem.usageLog);
      if (mem.compare) store.set({ compare: mem.compare });
      return;
    }
  }, []);

  // Persist (runs stay in IndexedDB under the simulation card's customId).
  useEffect(() => {
    if (messages.length === 0) return;
    saveTranscript({ messages, toolRows, profile, candidatesData, picks,
      exampleId, scenario, intake, household, overrides, usageLog,
      compare: store.getState().compare, savedAt: Date.now() });
  }, [messages, toolRows, profile, candidatesData, picks, exampleId, scenario,
    intake, household, overrides, usageLog]);

  const [detail, setDetail] = useState(null);
  const compareOpen = useSyncExternalStore(store.subscribe,
    () => store.getState().compareOpen, () => store.getState().compareOpen);
  useEffect(() => { if (compareOpen) setWorkOpen(true); }, [compareOpen]);
  // 27c2: Muse's open_panel for tour | commute | result lands here —
  // resolve it against live picks/candidates and the newest done run.
  const pendingScene = useSyncExternalStore(store.subscribe,
    () => store.getState().pendingScene, () => store.getState().pendingScene);
  useEffect(() => {
    if (!pendingScene) return;
    const st = stateRef.current;
    const cands = ((st.candidatesData && st.candidatesData.result
      && st.candidatesData.result.candidates) || []);
    const res = sceneForEffect(pendingScene,
      { picks: st.picks, candidates: cands, latestRun: latestDoneRun(st.messages) });
    if (res.url) {
      setScene({ url: res.url, title: res.title });
      setWorkOpen(true);
      setView("work");
    } else {
      pushMsg({ role: "assistant", kind: "text", content: res.say });
    }
    store.set({ pendingScene: null });
  }, [pendingScene]);
  // 27f: follow the conversation — newest message stays in view,
  // except a done simulation card keeps its own scroll target.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.kind === "simulation" && last.data && last.data.status === "done") return;
    soon(() => scrollChatToEnd());
  }, [messages.length, liveRows.length]);
  // 31d: the replay-done row mounts under the last message after the
  // content already scrolled — re-pin only while the reader is at the
  // bottom, never when they scrolled up to read.
  useEffect(() => {
    if (!replayId || replaying) return;
    soon(() => {
      try {
        if (typeof document === "undefined") return;
        const list = document.querySelector(".ui-chat-thread .astryx-chat-message-list");
        if (!list) return;
        if (shouldPinToBottom(pinRef.current,
          list.scrollTop, list.scrollHeight, list.clientHeight)) {
          list.scrollTop = list.scrollHeight;
        }
      } catch { /* keep the reader where they are */ }
    });
  }, [replayId, replaying]);
  // 29a4: fold the chip row while the customer reads up-thread; the
  // composer stays. Sending a message brings the chips back.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const list = document.querySelector(".ui-chat-thread .astryx-chat-message-list");
    if (!list) return undefined;
    const onScroll = () => {
      try {
        const atBottom = chipsVisible(list.scrollTop, list.scrollHeight, list.clientHeight);
        pinRef.current = atBottom;
        setChipsNearBottom(atBottom);
      } catch { /* keep the chips as they are */ }
    };
    onScroll();
    list.addEventListener("scroll", onScroll, { passive: true });
    // 31d: the last message grows after it lands (streaming text, cards
    // finishing) — while the reader is at the bottom, keep the list
    // pinned so the newest line is never cut under the fold. A reader
    // who scrolled up is never moved. Direct scrollTop assignment has
    // no animation, so there is nothing to reduce for reduced motion.
    let ro = null;
    try {
      const content = list.firstElementChild || list;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          try {
            if (shouldPinToBottom(pinRef.current,
              list.scrollTop, list.scrollHeight, list.clientHeight)) {
              list.scrollTop = list.scrollHeight;
            }
          } catch { /* keep the reader where they are */ }
        });
        ro.observe(content);
      }
    } catch { /* the message-landing scroll still runs */ }
    return () => {
      list.removeEventListener("scroll", onScroll);
      try { if (ro) ro.disconnect(); } catch { /* already gone */ }
    };
  }, [messages.length]);
  // 29a4: the top-bar summary button scrolls to the latest 고객님 상황
  // card and opens its 자세히 section.
  const profileDetailsRequest = useSyncExternalStore(store.subscribe,
    () => store.getState().profileDetailsRequest || 0, () => 0);
  useEffect(() => {
    if (!profileDetailsRequest) return;
    try {
      if (typeof document === "undefined") return;
      const cards = [...document.querySelectorAll(".ui-chat-thread [data-profile-details]")];
      const last = cards[cards.length - 1];
      if (!last) return;
      if (last.tagName === "DETAILS" && !last.open) last.open = true;
      if (typeof last.scrollIntoView === "function") last.scrollIntoView({ block: "start" });
    } catch { /* keep the thread as it is */ }
  }, [profileDetailsRequest]);
  // 26c: a resolved place (Meta HQ) names the destination and pins
  // the map's work pin at its lon/lat.
  const wpResolved = (profile && profile.workplaces && profile.workplaces.value
    && profile.workplaces.value[0] && profile.workplaces.value[0].resolved) || null;
  const destName = (wpResolved
    && (wpResolved.station || (wpResolved.place && wpResolved.place.name))) || "";
  const workPlace = wpResolved && wpResolved.place
    ? { name: wpResolved.place.name, lon: wpResolved.place.lon, lat: wpResolved.place.lat }
    : null;

  const handlers = {
    picks,
    intake, household, profile, exampleId,
    onChip: (field, starter) => setComposer(starter),
    onOpenWork: () => setWorkOpen(true),
    onScene: (s) => { setScene(s); setWorkOpen(true); setView("work"); },
    onSort: handleSort,
    onTogglePick: handleTogglePick,
    onPreview3D: handlePreview3D,
    onJeonse: handleJeonse,
    onRun: handleRun,
    onAsk: (text) => send(text),
    onIntakeAnswer: handleIntakeAnswer,
    onIntakeSkip: handleIntakeSkip,
    onHouseholdAdd: handleHouseholdAdd,
    onHouseholdRemove: handleHouseholdRemove,
    onFindHomes: () => {
      if (profileRef.current && dataRef.current && !busyRef.current) {
        runSearch(profileRef.current, dataRef.current, { sort: "commute" });
      }
    },
    onDetail: (c) => setDetail(c),
    onHover: (key) => setCardHi(key),
    photoDeps: { named: namedPhotos, manifest: dataRef.current?.manifest || null },
    destName,
    // 29a3: station suggestions for the household 직장 box.
    stations: dataRef.current && dataRef.current.network
      ? stationNames(dataRef.current.network) : [],
    // 29a3: results-vs-profile state for the intake card fold.
    searchState: {
      hasResults: Boolean(candidatesData && candidatesData.result
        && (candidatesData.result.candidates || []).length > 0),
      changed: Boolean(candidatesData && candidatesData.result
        && (candidatesData.result.candidates || []).length > 0)
        && lastSearchRef.current !== (profile ? profileSummary(profile) : ""),
      onResearch: () => {
        if (profileRef.current && dataRef.current && !busyRef.current) {
          runSearch(profileRef.current, dataRef.current, { sort: "commute" });
        }
      },
    },
  };

  const summary = profile ? profileSummary(profile) : "";
  // 31b: the tray offers 결과 보기 (instead of a second identical run)
  // once the done simulation in the thread ran for these exact picks.
  const trayCandidates = (candidatesData && candidatesData.result.candidates) || [];
  const trayResultReady = resultReadyFor(messages, picks, trayCandidates);
  const handleViewResult = () => {
    // On the narrow Chat / Map toggle the result lives in Chat.
    if (narrow) setView("chat");
    const sim = [...messages].reverse().find((m) => m && m.kind === "simulation");
    soon(() => scrollChatToSim(sim && sim.id));
  };
  // 26p: one toggle instance — its mount point moves with the viewport.
  // 29a4: paneTabsMount keeps exactly one mount point per layout.
  // 32a: the mount follows the single 900 px narrow breakpoint.
  const tabsMount = paneTabsMount({ workOpen, phone: narrow });
  const narrowTabs = (<ChatPaneTabs view={view} onChange={setView} />);
  // 32a: the suggestion chips ride the composer's drawer slot.
  // 32a2: the shell owns the drawer state — collapsed until opened,
  // folding again after any chip is used.
  const suggestionDrawer = suggestionDrawerFor({ messages, chipsNearBottom,
    museFails, replayId, profile, open: drawerOpen, onOpenChange: setDrawerOpen,
    onSend: (text) => { setDrawerOpen(false); send(text); },
    onAction: (chip) => { setDrawerOpen(false); chipAction(chip); },
    onReplay: () => { setDrawerOpen(false); openReplay(); } });
  // 31f: scroll a candidate card into view (best-effort).
  function scrollToCandidateCard(id) {
    try {
      const el = typeof document !== "undefined"
        ? document.getElementById(`cand-${id}`) : null;
      if (el && typeof el.scrollIntoView === "function") {
        const reduced = typeof window !== "undefined" && window.matchMedia
          && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      }
    } catch {
      // Hover still highlights the card; scroll is best-effort.
    }
  }

  return (
    <div className={`ui-chat overlay${view === "work" ? " ui-chat-narrow-work" : ""}`}>
      <AppShell
        variant="surface"
        contentPadding={0}
        mobileNav={false}
        topNav={(
          <>
          <TopBar mode="chat" summary={summary}
            extra={tabsMount === "top" ? narrowTabs : null}
            settings={{
              mode: "chat",
              model: { usageLog, serverKeys, errors: modelErrors },
              modelExtra: IS_DEV ? (
                <DropdownMenu
                  button={{ label: provider === "meta" ? "Spark 1.3" : "Spark Open",
                    variant: "ghost", size: "sm" }}
                  menuWidth={240}
                  items={[
                    { label: "Spark 1.3 (Muse Spark 1.3)", onClick: () => setProvider("meta") },
                    { label: "Spark Open (Muse Spark Open)", onClick: () => setProvider("baseten") },
                  ]} />
              ) : null,
              assumptions: { overrides,
                onSet: (id, v) => setOverrides((o) => setOverride(o, id, v)),
                onReset: (id) => setOverrides((o) => resetOverride(o, id)) },
              onIntro: null,
              onRestart: () => { clearTranscript(); window.location.href = appUrl(); },
            }} />
          {tabsMount === "shell" ? narrowTabs : null}
          </>
        )}>
        <div className="ui-chat-main" ref={splitRef}
          data-panel={chatMainPanelAttr(detail, compareOpen)}
          data-work={chatWorkAttr(workOpen)}
          data-fullmap={workOpen && fullMap ? "on" : undefined}>
          {!(workOpen && fullMap) && (
          <section className={messages.length === 0 && !busy ? "ui-chat-thread ui-chat-thread-empty" : "ui-chat-thread"} aria-label="대화"
            style={workOpen && !narrow ? { width: threadWidth } : undefined}>
            {replayId && replaying && (
              <div className="ui-replay-notice">
                <ReplayNotice replayMeta={replayMeta}
                  onSkip={skipReplay} onExit={exitReplay} />
              </div>
            )}
            {messages.length === 0 && !busy ? (
              <ChatEmpty onSend={(text) => send(text)}
                onListing={() => chipAction("매물 글 붙여 넣기")}
                onExample={handleExample} replayId={replayId} />
            ) : (
            <ChatLayout
              density="compact"
              composer={(
                <>
                  <ChatComposer onSubmit={send} isDisabled={busy || !!replayId}
                    value={composer} onChange={setComposer}
                    drawer={suggestionDrawer}
                    sendActions={canVoice ? (
                      <MicButton onText={appendVoiceText}
                        disabled={busy || !!replayId}
                        onNotice={voiceNoteFor} />
                    ) : null}
                    placeholder={busy ? "Muse가 일하는 중…" : "이어서 말씀해 보세요…"} />
                  {voiceNote ? (
                    <Text type="supporting">{voiceNote}</Text>
                  ) : null}
                </>
              )}>
              <ThreadList>
                {messages.map((m) => (
                  <MsgBoundary key={m.id}>
                    {m.role === "user" ? (
                      <ChatMessage sender="user">
                        <ChatMessageBubble data-no-i18n>{m.content}</ChatMessageBubble>
                      </ChatMessage>
                    ) : m.role === "system" ? (
                      <ChatSystemMessage>{m.content}</ChatSystemMessage>
                    ) : m.kind === "text" ? (
                      <AssistantMsg msg={m} toolRows={toolRows} />
                    ) : (
                      <CardMsg msg={m} handlers={handlers} toolRows={toolRows} cardHi={cardHi} />
                    )}
                  </MsgBoundary>
                ))}
                {busy && (
                  <ChatMessage sender="assistant">
                    <ChatMessageBubble variant="ghost">
                      {liveRows.length === 0 ? (
                        <Text type="supporting">Muse가 생각하는 중…</Text>
                      ) : (
                        liveRows.map((row, i) => (
                          <Text key={`${row.name}-${i}`} type="supporting"><span data-no-i18n>{liveRowLine(row, currentLang())}</span></Text>
                        ))
                      )}
                    </ChatMessageBubble>
                  </ChatMessage>
                )}
              </ThreadList>
              {replayId && !replaying && (
                <div className="ds-replay-done">
                  <Button size="sm" variant="secondary" label="직접 해 보기" onClick={exitReplay} />
                </div>
              )}
              {/* 26z2: narrow chat pane keeps the run action in flow
                  above the chips (the full tray never renders there). */}
              {compactTrayVisible({ narrow, view }) && (
              <PicksTray compact picks={picks}
                candidates={(candidatesData && candidatesData.result.candidates) || []}
                gate={runGate(profile)}
                resultReady={trayResultReady} onViewResult={handleViewResult}
                onRun={handleRun} onRemove={handleTogglePick} />
              )}
            </ChatLayout>
            )}
            {error && (
              <Banner status="error" title="요청 실패" description={error}
                isDismissable onDismiss={() => setError("")} />
            )}
          </section>
          )}
          {workOpen && !fullMap && !narrow && (
            <ResizeHandle resizable={threadResize.props} label="대화 너비 조절" hasDivider />
          )}
          {workOpen && (
          <MsgBoundary>
          {scene ? (
          <SceneFrame scene={scene}
            onBack={() => setScene(null)}
            onClose={() => { setScene(null); setWorkOpen(false); setView("chat"); }} />
          ) : (
          <StageArea
            onClose={() => { setWorkOpen(false); setView("chat"); setFullMap(false); }}
            fullMap={fullMap}
            onToggleFull={() => setFullMap((v) => !v)}
            map={buildChatMap({
              regions: regionsForCurrency(dataRef.current?.regionsDoc
                || { regions: [] }, currencyOf(profile)),
              network: dataRef.current?.network || null,
              tiles: mapTiles,
              green: mergeGreenBoxes(dataRef.current?.greenBoxes),
              candidates: candidatesData?.result?.candidates || [],
              picks,
              workplaceStation: destName || null,
              workPlace: workPlace || null,
              tenure: candidatesData?.tenure || null,
            })}
            contextLine={stageContextLine(profile, candidatesData)}
            cardHi={cardHi}
            onPinHover={(key) => setCardHi(key)}
            onPinClick={(id) => scrollToCandidateCard(id)}
            onViewCard={(id) => {
              // 31f: the pin card's 카드 보기 — on the narrow
              // layout the card lives in the 대화 tab.
              if (narrow) setView("chat");
              scrollToCandidateCard(id);
            }}
            picks={picks} onTogglePick={handleTogglePick}
            profile={profile}
            kindsAvailable={Array.from(new Set(
              ((candidatesData && candidatesData.result
                && candidatesData.result.candidates) || [])
                .map((c) => c && c.kind).filter(Boolean)))}
            onFilterChange={handleFilterChange} />
          )}
          </MsgBoundary>
          )}
          {workOpen && !scene && stageTrayVisible({ narrow, view }) && (
          <PicksTray picks={picks}
            candidates={(candidatesData && candidatesData.result.candidates) || []}
            gate={runGate(profile)}
            stations={dataRef.current && dataRef.current.network
              ? stationNames(dataRef.current.network) : []}
            onWorkplaceText={handleTrayWorkplace} onNoCommute={handleTrayNoCommute}
            resultReady={trayResultReady} onViewResult={handleViewResult}
            onRun={handleRun} onRemove={handleTogglePick} />
          )}
          {workOpen && (
          <SidePanel picks={picks} candidatesData={candidatesData}
            detail={detail} onCloseDetail={() => setDetail(null)}
            photoDeps={handlers.photoDeps} destName={destName}
            tenure={candidatesData?.tenure || "undecided"}
            onTogglePick={handleTogglePick} onJeonse={handleJeonse} />
          )}
        </div>
        {viewChip && (
          <div className="ui-viewchip overlay">{viewChip}</div>
        )}
        <Toaster />
        {/* 18: the drawer's 결과 공유 needs its dialog on this screen too. */}
        <ShareDialog />
      </AppShell>
    </div>
  );
}

// 19g: the picks tray shifts left while the side panel is open, so
// the run button stays visible. Rendered as data-panel="open" on
// .ui-chat-main with a CSS rule.
export function chatMainPanelAttr(detail, compareOpen) {
  return detail || compareOpen ? "open" : undefined;
}

// 27a: chat-first empty state (no greeting, no form). The composer
// is the same ChatComposer; the starters fill it or send once.
export const EMPTY_STARTERS = [
  { id: "replay", label: "기록된 한 달 보기" },
  { id: "metahq", label: "Meta 본사 출근으로 해 보기" },
  { id: "seoul", label: "서울로 해 보기" },
  { id: "find", label: "출근지로 집 찾기" },
  { id: "listing", label: "본 매물 붙여 넣기" },
  { id: "example", label: "예시로 써 보기" },
];

const EMPTY_FIND_TEXT = "판교로 출근해요. 전세 2억 이하로 혼자 살 집 찾아 줘";
const META_HQ_TEXT = META_HQ_EXAMPLE;

// 26w: an example card sends its prompt as the first message, the same
// path as typing it (exported for the no-DOM test).
export function sendExamplePrompt(onSend, prompt) {
  if (onSend) onSend(prompt);
}

// 26w2: pure decision for the empty-state backdrop — the city glide
// runs only while the chat is empty and a WebGL canvas can show it;
// without WebGL the screen keeps today's plain background.
export function shouldGlideBackdrop({ empty, webgl } = {}) {
  return empty === true && webgl === true;
}

function webglAvailable() {
  try {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function ChatEmpty({ onSend, onListing, onExample, replayId }) {
  const [value, setValue] = useState("");
  // 29b: voice input for the empty-state composer (same rules as main).
  const [emptyVoiceNote, setEmptyVoiceNote] = useState("");
  const emptyVoiceTimer = useRef(null);
  function flashEmptyVoiceNote(text) {
    setEmptyVoiceNote(text || "");
    if (emptyVoiceTimer.current) clearTimeout(emptyVoiceTimer.current);
    if (text) {
      emptyVoiceTimer.current = setTimeout(() => setEmptyVoiceNote(""), 4000);
    }
  }
  function appendEmptyVoiceText(text) {
    const t = String(text || "").trim();
    if (!t) return;
    setValue((prev) => (prev && String(prev).trim() ? `${prev} ${t}` : t));
    flashEmptyVoiceNote(VOICE_DONE_NOTE);
  }
  const canEmptyVoice = !replayId && voiceSupported()
    && voiceKeyReady(getMuseStatus());
  // 26w: while the chat is empty the landing glide plays behind this
  // screen (quiet, no captions); the first message unmounts it and the
  // glide pauses again so the customer orbits freely.
  useEffect(() => {
    let started = false;
    try {
      const reduced = typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches;
      // 26w2: start the glide only when it can show (WebGL canvas).
      if (!reduced && shouldGlideBackdrop({ empty: true, webgl: webglAvailable() })
        && store.hasAction("toggleTourPlay") && !store.getState().tourPlaying) {
        store.act("toggleTourPlay");
        started = store.getState().tourPlaying === true;
      }
    } catch {
      // Without the 3D view the screen stays white as before.
    }
    return () => {
      try {
        if (started && store.hasAction("toggleTourPlay") && store.getState().tourPlaying) {
          store.act("toggleTourPlay");
        }
      } catch {
        // Stay paused.
      }
    };
  }, []);
  const starterAction = (id) => {
    if (id === "find") setValue(EMPTY_FIND_TEXT);
    else if (id === "listing") { if (onListing) onListing(); }
    else if (id === "example") { if (onExample) onExample(); }
    else if (id === "replay") {
      try { window.location.href = appUrl("?replay=" + (LANG === "en" ? "menlo-month" : "seoul-couple")); } catch { /* keep the thread as it is */ }
    }
    else if (id === "metahq") { if (onSend) onSend(META_HQ_TEXT); }
    else if (id === "seoul") { if (onExample) onExample(); }
  };
  return (
    <div className="ui-chat-empty">
      <div className="ui-chat-empty-scrim" aria-hidden="true" />
      <div className="ui-chat-empty-body">
        <div>
          <Heading level={2}>{LANDING_HEADING}</Heading>
          <Text type="supporting">{LANDING_SUB}</Text>
        </div>
        <p className="ui-chat-empty-label">어떤 집을 고민 중이세요?</p>
        <ChatComposer onSubmit={(text) => onSend && onSend(text)}
          value={value} onChange={setValue}
          sendActions={canEmptyVoice ? (
            <MicButton onText={appendEmptyVoiceText} disabled={false}
              onNotice={(kind) => flashEmptyVoiceNote(
                kind === "done" ? VOICE_DONE_NOTE : VOICE_ERROR_NOTE)} />
          ) : null}
          placeholder="예: 판교로 출근해요. 전세로 혼자 살 집 찾아 줘" />
        {emptyVoiceNote ? (
          <Text type="supporting">{emptyVoiceNote}</Text>
        ) : null}
        <PoweredByMuse size="sm" live={LIVE_API} showStatus />
        <div className="ui-chat-empty-row">
          {EMPTY_STARTERS.map((s) => (
            <Button key={s.id} size="sm" variant="secondary" label={s.label}
              onClick={() => starterAction(s.id)} />
          ))}
        </div>
        <div className="ui-chat-empty-cards">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ui-landing-card"
              aria-label={`${p.title} 예시로 시작하기`}
              onClick={() => sendExamplePrompt(onSend, p.prompt)}>
              <span className="ui-landing-cardtop">
                <span className="ui-landing-cardtitle">{p.title}</span>
                <span className="ui-landing-cardchip">예시</span>
              </span>
              <p className="ui-landing-cardprompt">{p.prompt}</p>
            </button>
          ))}
        </div>
        <Text type="supporting" className="ui-chat-empty-coverage">{`다루는 지역: ${COVERAGE_AREAS.join(" · ")}`}<br />{COVERAGE_US_LINE}</Text>
      </div>
    </div>
  );
}

// 27a: the work panel (map / tray / side panel) opens on request.
export function chatWorkAttr(workOpen) {
  return workOpen ? "open" : "closed";
}

// 18: the stage header is the customer's context ("판교 출근 · 후보
// 6곳"), never a fixed scene name.
export function stageContextLine(profile, candidatesData) {
  const bits = [];
  const wps = profile && profile.workplaces && profile.workplaces.value;
  const where = Array.isArray(wps) && wps[0]
    && ((wps[0].resolved && wps[0].resolved.station) || wps[0].text);
  if (where) bits.push(`${where} 출근`);
  const n = candidatesData && candidatesData.result
    && candidatesData.result.candidates ? candidatesData.result.candidates.length : 0;
  if (n > 0) bits.push(`후보 ${n}곳`);
  return bits.length > 0 ? bits.join(" · ") : "";
}

// 18: merge cached per-box green rings (water + parks) into one layer.
export function mergeGreenBoxes(cache) {
  const water = [];
  const parks = [];
  try {
    for (const g of (cache && cache.values()) || []) {
      if (g && Array.isArray(g.water)) water.push(...g.water);
      if (g && Array.isArray(g.parks)) parks.push(...g.parks);
    }
  } catch {
    // The map paints fine without the green layer.
  }
  return { water, parks };
}

// 27c1: a 3D scene inside the work panel — the sim/tour page in an
// embed iframe, so the conversation never navigates away. 지도로
// returns to the map, 새 창으로 opens the same scene in a new tab.
export function SceneFrame({ scene, onBack, onClose }) {
  if (!scene) return null;
  return (
    <section className="ui-chat-scene" aria-label="3D 장면">
      <div className="ui-chat-scene-head">
        <span className="ui-chat-scene-title">{scene.title}</span>
        <span style={{ flex: "1 1 auto" }} />
        <Button size="sm" variant="ghost" label="지도로"
          onClick={() => onBack && onBack()} />
        <Button size="sm" variant="ghost" label="새 창으로"
          onClick={() => {
            if (typeof window !== "undefined" && scene.url) {
              window.open(withoutEmbed(scene.url), "_blank", "noopener");
            }
          }} />
        <IconButton label="작업판 닫기" variant="ghost" size="sm"
          icon={<Icon icon="close" />} onClick={() => onClose && onClose()} />
      </div>
      <iframe className="ui-chat-scene-frame" src={scene.url}
        title={scene.title} allow="fullscreen" />
    </section>
  );
}

// 32a: the two-panels glyph for the full-map button (no new dep).
export function TwoPanelsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2.5" y="4" width="6.5" height="12" rx="1" />
      <rect x="11" y="4" width="6.5" height="12" rx="1" />
    </svg>
  );
}

// 31f: StageArea passes the picks wiring through so the map pin
// card can 담기/빼기 with the same toggle as the candidate card.
// 31h: the filter chip row is the top line (a real DropdownMenu per
// chip, same ✓ look as the sort menu); the stage title drops to the
// line under it. Chips render only with a profile + onFilterChange,
// so older callers (and the empty stage) stay as they were.
// 32a: while the map has no candidates the filter row stays hidden,
// so only the empty card shows; the legend hides the same way
// (hideLegend into ChatMap). The top-right expand button toggles
// full-map mode (Esc returns); CSS hides it at ≤ 900 px.
// 32a2: with candidates the empty card never renders — even before
// regions arrive — so it can't overlap the filter row and title.
export function StageArea({ map, cardHi, onPinHover, onPinClick, onViewCard,
  picks, onTogglePick, contextLine, onClose, onToggleFull, fullMap,
  profile, kindsAvailable, onFilterChange }) {
  const regions = (map && map.regions) || [];
  const pins = (map && map.pins) || [];
  const hasCandidates = pins.length > 0;
  const kinds = Array.isArray(kindsAvailable) ? kindsAvailable
    : Array.from(new Set(pins
      .map((p) => p && p.candidate && p.candidate.kind).filter(Boolean)));
  const chips = (profile && onFilterChange && hasCandidates)
    ? mapFilterChips(profile, { kindsAvailable: kinds }) : [];
  const expandLabel = fullMap ? "대화 같이 보기" : "지도 크게 보기";
  return (
    <section className={chips.length > 0 ? "ui-chat-stage has-filters" : "ui-chat-stage"} aria-label="중심 무대">
      <div className="ui-chat-stage-body">
        {chips.length > 0 && (
          <div className="ui-chatmap-filters" role="group" aria-label="지도 조건">
            {chips.map((chip) => (
              <DropdownMenu key={chip.key} menuWidth={220}
                renderTrigger={(props) => (
                  <button type="button" {...props}
                    className={chip.set ? "ui-chatmap-chip is-set" : "ui-float ui-chatmap-chip"}>
                    {chip.label}
                    <span aria-hidden="true" className="ui-chatmap-chev">▾</span>
                  </button>
                )}
                items={chip.options.map((o) => ({
                  label: `${o.selected ? "✓ " : ""}${o.label}`,
                  onClick: () => onFilterChange(filterPatch(chip.key, o.value, profile)),
                }))} />
            ))}
          </div>
        )}
        <div className="ui-float ui-stage-title" role="status">
          {contextLine || "출근지를 말하면 후보가 지도에 표시돼요"}
        </div>
        <span className="ui-stage-headbtns">
          <span className="ui-stage-expand">
            <Button size="sm" variant="ghost" label={expandLabel}
              title={expandLabel} aria-label={expandLabel}
              icon={<TwoPanelsIcon />}
              onClick={() => onToggleFull && onToggleFull()} />
          </span>
          <IconButton label="작업판 닫기" variant="ghost" size="sm"
            icon={<Icon icon="close" />} onClick={() => onClose && onClose()} />
        </span>
        {regions.length > 0 || hasCandidates ? (
          <ChatMap map={map} cardHi={cardHi}
            onPinHover={onPinHover} onPinClick={onPinClick} onViewCard={onViewCard}
            picks={picks} onTogglePick={onTogglePick}
            hasFilters={chips.length > 0} hideLegend={!hasCandidates} />
        ) : (
          <div style={chips.length > 0 ? { padding: 16, paddingTop: 64 } : { padding: 16 }}>
            <Card padding={3}>
              <VStack gap={1}>
                <Heading level={4}>서울·경기 동남부</Heading>
                <Text type="supporting">대화에서 조건을 말하면 후보 지역이 여기에 표시돼요.</Text>
                <Text type="supporting">판교 · 분당 · 강남 · 송파 · 위례 · 수지 · 성동 · 강동</Text>
              </VStack>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}

const PICK_LETTERS = ["A", "B", "C"];

// 19a: the only run button on the chat screen. It floats over the
// bottom of the map stage; nothing renders until a home is picked.
// 21a: no run without a commute. When gate is unresolved the button
// reads WORKPLACE_ASK_LABEL and clicking it focuses the inline
// workplace input (station autocomplete + "출근 안 해요"); only a
// resolved workplace (or 출근 안 해요) restores the run label.
export const WORKPLACE_ASK_LABEL = "회사 위치를 알려 주세요";

// 31b: label for the tray button once the 30-day run for these exact
// picks already finished — it scrolls to the result, never re-runs.
export const RESULT_VIEW_LABEL = "결과 보기";

// 31b: true when the thread's latest simulation message is done AND it
// ran for the same picks as now. Candidate ids win when the payload
// carries them; otherwise data.names is compared against the picks'
// display names. Any pick change, running or errored run → false.
export function resultReadyFor(messages, picks, candidates) {
  const list = Array.isArray(messages) ? messages : [];
  let sim = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const mm = list[i];
    if (mm && mm.kind === "simulation") { sim = mm; break; }
  }
  if (!sim || !sim.data || sim.data.status !== "done") return false;
  const ids = Array.isArray(picks) ? picks : [];
  if (ids.length === 0) return false;
  const data = sim.data;
  for (const f of ["pickIds", "candidateIds", "ids", "picks"]) {
    if (Array.isArray(data[f]) && data[f].length > 0) {
      const a = data[f].map(String).sort();
      const b = ids.map(String).sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
  }
  if (!data.names || typeof data.names !== "object") return false;
  const picked = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => ids.includes(c.id));
  if (picked.length !== ids.length || picked.length === 0) return false;
  const a = Object.values(data.names).map(String).sort();
  const b = picked.map((c) => displayNameFor(c)).map(String).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function PicksTray({ picks, candidates, onRun, onRemove,
  gate, stations, onWorkplaceText, onNoCommute, compact,
  resultReady, onViewResult }) {
  const { picked, canRun, hint } = runReadiness(picks, candidates);
  const [workText, setWorkText] = useState("");
  const [workError, setWorkError] = useState("");
  const workRef = useRef(null);
  const trayRef = useRef(null);
  // 31j: the map credit clears the tray's real height — measure it
  // and publish it as --ui-chat-tray-h on the chat root.
  useEffect(() => {
    const el = trayRef.current;
    if (!el || typeof window === "undefined" || !window.ResizeObserver) return undefined;
    const set = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const host = (el.closest && el.closest(".ui-chat-main")) || document.documentElement;
      if (host && host.style) host.style.setProperty("--ui-chat-tray-h", `${h}px`);
    };
    set();
    const ro = new window.ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (picked.length === 0) return null;
  const needWorkplace = !!(gate && !gate.ok);
  // 31b: the run already finished for these picks — offer the result
  // as a quiet secondary button instead of a second identical run.
  const showResult = resultReady === true && !needWorkplace;
  const label = needWorkplace ? WORKPLACE_ASK_LABEL
    : showResult ? RESULT_VIEW_LABEL : RUN_BUTTON_LABEL;
  const variant = showResult ? "secondary" : "primary";
  const activate = () => {
    if (showResult) {
      if (onViewResult) onViewResult();
      return;
    }
    if (needWorkplace) {
      // 26z2: the compact row has no input — it funnels through
      // onRun, which explains the missing workplace.
      if (compact) {
        if (onRun) onRun();
        return;
      }
      if (workRef.current && workRef.current.focus) workRef.current.focus();
      return;
    }
    if (onRun) onRun();
  };
  // 26z2: compact in-flow run row for the phone chat pane (the full
  // tray is hidden there by CSS). Same label, same onRun, same
  // workplace gate as the tray; without its input the button funnels
  // through onRun, which explains the missing workplace.
  if (compact) {
    return (
      <div className="ui-picks-compact" role="group" aria-label="고른 집">
        <span className="ui-picks-compact-names">
          {picked.map((c, i) => `${PICK_LETTERS[i] || "·"} ${displayNameFor(c)}`).join(" · ")}
        </span>
        <span className="ui-picks-compact-sep" aria-hidden="true">—</span>
        <Button label={label} variant={variant} className="ui-picks-run"
          isDisabled={!needWorkplace && !canRun}
          onClick={activate} />
      </div>
    );
  }
  const trayHint = picked.length === 1
    ? "한 곳 더 담으면 비교할 수 있어요"
    : hint;
  const submitWork = () => {
    const ok = onWorkplaceText ? onWorkplaceText(workText) : false;
    if (ok) {
      setWorkText("");
      setWorkError("");
    } else {
      setWorkError("우리 자료에 없는 곳이에요. 가까운 역 이름으로 다시 알려 주세요.");
    }
  };
  return (
    <div className="ui-picks-tray" role="group" aria-label="고른 집" ref={trayRef}>
      <div className="ui-picks-tray-row">
        <div className="ui-picks-tray-chips">
          {picked.map((c, i) => (
            <span key={c.id} className="ui-pick-chip">
              <span className="ui-pick-disc" aria-hidden="true"
                data-home={/^[AB]$/.test(PICK_LETTERS[i] || "") ? PICK_LETTERS[i] : undefined}>
                {PICK_LETTERS[i] || "·"}
              </span>
              <span className="ui-pick-name"><HomeName name={displayNameFor(c)} /></span>
              <button type="button" className="ui-pick-x"
                aria-label={`${displayNameFor(c)} 빼기`}
                onClick={() => onRemove && onRemove(c)}>×</button>
            </span>
          ))}
        </div>
        <Button label={label} variant={variant} className="ui-picks-run"
          isDisabled={!needWorkplace && !canRun}
          onClick={activate} />
      </div>
      {needWorkplace && (
        <div className="ui-picks-work">
          <input className="ui-keyinput" value={workText} ref={workRef}
            placeholder="회사 근처 역이나 동네 (예: 강남역)"
            list="ui-picks-stations"
            onChange={(e) => setWorkText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitWork(); }}
            aria-label="회사 근처 역이나 동네" />
          <datalist id="ui-picks-stations">
            {(stations || []).map((s) => <option key={s} value={`${s}역`} />)}
          </datalist>
          <Button size="sm" variant="secondary" label="입력" onClick={submitWork} />
          <Button size="sm" variant="ghost" label="출근 안 해요"
            onClick={() => onNoCommute && onNoCommute()} />
        </div>
      )}
      {needWorkplace && workError ? (
        <Text type="supporting">{workError}</Text>
      ) : !canRun && (
        <Text type="supporting">{trayHint}</Text>
      )}
    </div>
  );
}

// 19a: detail / compare open over the stage's right edge only on demand.
export function SidePanel({ picks, candidatesData, detail, onCloseDetail,
  photoDeps, destName, tenure, onTogglePick, onJeonse }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  if (!detail && !state.compareOpen) return null;
  const detailPhotos = detail
    ? selectPhotosForList([detail], photoDeps || {})[0].photos : null;
  return (
    <aside className="ui-side-panel" aria-label="상세 패널">
      <HStack gap={1} vAlign="center">
        <Heading level={4}>{detail ? "자세히" : "비교"}</Heading>
        <span className="ui-panel-spacer" />
        <Button size="sm" variant="ghost" label="닫기"
          onClick={() => {
            if (detail && onCloseDetail) onCloseDetail();
            else store.set({ compareOpen: false });
          }} />
      </HStack>
      {detail && (
        <CandidateCard candidate={detail} tenure={tenure} destName={destName}
          variant="full" photos={detailPhotos} picked={(picks || []).includes(detail.id)}
          onLive={() => onTogglePick && onTogglePick(detail)}
          onJeonse={() => onJeonse && onJeonse(detail)} onDetail={null} />
      )}
      {state.compareOpen && (
        <CompareCard state={state} />
      )}
    </aside>
  );
}

// 19a: kept for older callers — the tray + panel without a drawer column.
export function DrawerArea({ picks, candidatesData, onRun,
  detail, onCloseDetail, photoDeps, destName, tenure, onTogglePick, onJeonse,
  resultReady, onViewResult }) {
  const candidates = (candidatesData && candidatesData.result.candidates) || [];
  return (
    <>
      <PicksTray picks={picks} candidates={candidates}
        resultReady={resultReady} onViewResult={onViewResult}
        onRun={onRun} onRemove={onTogglePick} />
      <SidePanel picks={picks} candidatesData={candidatesData}
        detail={detail} onCloseDetail={onCloseDetail} photoDeps={photoDeps}
        destName={destName} tenure={tenure}
        onTogglePick={onTogglePick} onJeonse={onJeonse} />
    </>
  );
}
