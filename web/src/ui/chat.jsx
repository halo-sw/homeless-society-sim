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
  ChatComposer, ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { store, selectState } from "./store.js";
import { AssistantMsg, ToolRows, CiteRows, mergeMoneyResults } from "./consult.jsx";
import { IntakeCard, HouseholdCard } from "./intake.jsx";
import { CandidateCard, CandidateSkeleton } from "./candidate-card.jsx";
import { exampleLine } from "./copy.js";
import { TopBar } from "./topbar.jsx";
// 18: StageArea renders ChatMap (./chatmap.jsx), not the slab OrbView.
import { toast, Toaster } from "./toast.jsx";
import {
  INTAKE_STEPS, intakeState0, currentStep, prefillFromExtract,
  answerStep, skipStep, household0, addMember, removeMember,
  intakeToProfilePatch, intakeTookLine, householdHint,
} from "../intake.js";
import { selectPhotosForList } from "../places/select-photos.js";
import { newUsageLog, recordTurn } from "../models/catalog.js";
import { loadByoKey } from "../consult/byok.js";
import { buildChatMap, extractGreenRings } from "../chatmap.js";
import { ChatMap } from "./chatmap.jsx";
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
import { oneWayByLabel, oneWayDelta, oneWaySentence } from "../verify/numbers.js";
import { ShareDialog } from "./share.jsx";
import { JeonseTab } from "./jeonse.jsx";
import { WorthItTab } from "./worthit.jsx";
import { SupportTab } from "./support.jsx";
import { PasteCheck } from "./listings.jsx";
import { HOME_SORTS, HOME_SORT_KO, applyKindPreference } from "../homes.js";
import { EXAMPLE_PROFILE_LABEL, noCommuteEntry } from "../profile.js";
import { outingsFor, hhmm } from "../timeline.js";
import {
  extractStep, searchStep, searchWithBoxes, scenarioStep, runStep,
  loadHomesIndex, loadNetwork, loadSchedule, loadPhotosManifest,
  loadNamedPhotos, loadRegions, loadPayroll, loadCorridorTiles,
  loadBoxArea, createWorkerRunner, fieldRows, sourceKo,
  profileSummary, missingChips, regionsForNames, simReadyFor,
  homeForScenario, complexNameForCandidate, stationNames,
  runGate, profileHomeKinds,
} from "../chat/engine.js";
import { buildCustomMoneyDoc, buildUsRentMoneyDoc } from "../chat/custom-money.js";
import { newCustomId, saveCustomRun } from "../chat/idb.js";
import { chatUrl, simMomentUrl, saveTranscript, loadTranscript,
  clearTranscript, parseChatSearch } from "../chat/urls.js";
import { postConsult, loadScenario } from "./consult-client.js";
import { LIVE_API, appUrl } from "../paths.js";
import { recordedReplyFor } from "./demotour.js";
import { REGION_NAME_ALIASES } from "../region-names.js";
import { agentContext, stripToolLabel, viewSystemLine } from "./agent-float.js";
import { LANG } from "../i18n/lang.js";

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
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>고객님 상황</Heading>
          {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
        </HStack>
        {said.length > 0 && (
          <div className="ui-tags">
            {said.map((s, i) => (
              <span key={i} className="ui-tag">{s}</span>
            ))}
          </div>
        )}
        {chips.length > 0 && (
          <VStack gap={1}>
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
        <details className="ui-section">
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
export const RUN_BUTTON_LABEL = "이 집들로 30일 살아 보기";

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

export function runReadiness(picks, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const picked = list.filter((c) => picks.includes(c.id));
  const unready = picked.filter((c) => readinessNote(c));
  const canRun = picked.length >= 2 && unready.length === 0;
  const hint = picked.length < 2
    ? `비교할 집을 2–3곳 담아 주세요 (지금 ${picked.length}곳)`
    : unready.length > 0
      ? `살아 보기를 못 하는 집이 있어요 (${unready.map((c) => c.name).join("·")})`
      : `${picked.length}곳을 30일씩 살아 보고 비교해 드려요`;
  return { picked, unready, canRun, hint, label: RUN_BUTTON_LABEL };
}

export function CandidatesCard({ data, tenure, sort, onSort, picks, onTogglePick,
    onPreview3D, onJeonse, onRun, onDetail, onHover, photoDeps, destName, example, highlightId }) {
  const candidates = (data && data.candidates) || [];
  // 13: one photo per card at most — dedup across the whole list.
  const withPhotos = selectPhotosForList(candidates, photoDeps || {});
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={4}>{`집 후보 ${candidates.length}곳`}</Heading>
          {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
          <span className="ui-panel-spacer" />
          <DropdownMenu
            button={{ label: HOME_SORT_KO[sort] || HOME_SORT_KO.commute, variant: "ghost", size: "sm" }}
            menuWidth={220}
            items={HOME_SORTS.map((s) => ({
              label: `${s === sort ? "✓ " : ""}${HOME_SORT_KO[s]}`,
              onClick: () => onSort && onSort(s),
            }))} />
        </HStack>
        {data && (
          <Text type="supporting">
            {`조건에 맞는 집 ${data.total_matching.toLocaleString()}곳 중 ${candidates.length}곳 · ${data.sort_note || ""}`}
          </Text>
        )}
        {candidates.length === 0 && (
          <Text>조건에 맞는 집이 없어요. 예산·크기·지역을 조금 넓혀 보세요.</Text>
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
                  note={readinessNote(c)}
                  onLive={() => onTogglePick(c)}
                  onJeonse={() => onJeonse(c)} onDetail={() => onDetail && onDetail(c)} />
              </div>
            );
          })}
        </div>
        {candidates.length > 0 && (
          <Text type="supporting">
            {picks.length < 2
              ? "마음에 드는 집을 2곳 담으면 지도 아래에서 30일 살아 보기를 시작할 수 있어요"
              : "지도 아래 ‘이 집들로 30일 살아 보기’를 눌러 주세요"}
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

// 19d: the 30-day result as an A|B table — one grid, never sorted,
// never crowned. Header: letter disc + name per home. Rows: 내 기준
// 점수 (score + neutral bar, caption spanning below), 월 주거비
// (short value, full value in title), 출퇴근 편도 (one_way, or one
// row per member on older payloads). 살아 보니 and the single
// 어떻게 계산했나요 disclosure live in the SimulationCard done branch.
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
          <span className="ui-pick-disc" aria-hidden="true">{l}</span>
          <span className="ui-result-name">{(names[l] || "").trim() || l}</span>
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
            return (
              <span key={`money-${l}`} className="ui-result-value" title={text}>
                {text}
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

export function SimulationCard({ data, example, onRetry }) {
  if (!data) return null;
  if (data.status === "running") {
    const p = data.progress || { done: 0, total: 1, label: "" };
    return (
      <Card padding={3}>
        <VStack gap={2}>
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
      <Card padding={3}>
        <VStack gap={2}>
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
    <Card padding={3}>
      <VStack gap={2}>
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
          <VStack gap={1}>
            <Text>살아 보니</Text>
            {texts.map((t, i) => {
              // 19i: the row opens its own moment (day, time, person);
              // only older recorded payloads (no day/minute) use the
              // per-home first outing.
              const url = momentRowUrl(t, { custom: data.customId,
                scenario: data.scenario || null,
                fallback: moments.find((m) => m.label === t.home) || null });
              return (
                <div key={i} className="ui-result-moment">
                  <span className="ui-result-when">{t.when_ko}</span>
                  <span className="ui-pick-disc" aria-hidden="true">{t.home}</span>
                  <span className="ui-result-text">{t.text_ko}</span>
                  {url && (
                    <Button size="sm" variant="ghost" label="3D로 보기 →"
                      onClick={() => {
                        window.location.href = url;
                      }} />
                  )}
                </div>
              );
            })}
          </VStack>
        )}
        {calcs.length > 0 && (
          <details className="ui-section">
            <summary className="ui-section-head">어떻게 계산했나요</summary>
            <div className="ui-section-body">
              {calcs.map(({ label, mh }) => (
                <VStack gap={1} key={label}>
                  <HStack gap={1} vAlign="center">
                    <span className="ui-pick-disc" aria-hidden="true">{label}</span>
                    <Text type="supporting">{(names[label] || "").trim() || label}</Text>
                  </HStack>
                  <HowCalculated tenure={mh.tenure} housing={mh.housingDoc}
                    maintenanceWon={mh.maintenanceWon} transitWon={mh.transitWon} />
                </VStack>
              ))}
            </div>
          </details>
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
    <Card padding={3}>
      <VStack gap={2}>
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
    <Card padding={3}>
      <PasteCheck onAsk={onAsk} />
    </Card>
  );
}

// --- IntakeFlowCard (13, Part 2) --------------------------------------------------------------
// The guided intake as inline answer cards: current step, household
// (up to 4), then the profile summary + 후보 찾기. Free conversation
// continues at any point (the composer stays live).

export function IntakeFlowCard({ intake, household, profile, handlers }) {
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
  return (
    <VStack gap={2}>
      {took && <Text type="supporting">{took}</Text>}
      {step && !intake.done && (
        <IntakeCard step={step} index={INTAKE_STEPS.indexOf(step)}
          total={INTAKE_STEPS.length}
          value={intake.values[step]} said={Boolean(intake.said[step])}
          onAnswer={handlers.onIntakeAnswer} onSkip={handlers.onIntakeSkip} />
      )}
      {showHousehold && (
        <HouseholdCard household={household} defaultWorkplace={saidWork}
          onAdd={handlers.onHouseholdAdd} onRemove={handlers.onHouseholdRemove} />
      )}
      {showHousehold && hhHint && <Text type="supporting">{hhHint}</Text>}
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
        <ChatMessage sender="assistant" avatar={<span className="ui-mark" aria-hidden="true" />}>
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
  return (
    <ChatMessage sender="assistant" avatar={<span className="ui-mark" aria-hidden="true" />}>
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
            picks={handlers.picks} onTogglePick={handlers.onTogglePick}
            onPreview3D={handlers.onPreview3D} onJeonse={handlers.onJeonse}
            onRun={handlers.onRun} onDetail={handlers.onDetail}
            onHover={handlers.onHover} photoDeps={handlers.photoDeps}
            destName={handlers.destName} example={msg.example}
            highlightId={cardHi} />
        )}
        {msg.kind === "intake" && (
          <IntakeFlowCard intake={handlers.intake} household={handlers.household}
            profile={handlers.profile} handlers={handlers} />
        )}
        {msg.kind === "simulation" && (
          <div data-sim-card={msg.id}>
            <SimulationCard data={data} example={msg.example}
              onRetry={handlers.onRun} />
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
      <CiteRows tools={tools} />
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

export function momentRowUrl(t, { custom = null, scenario = null, runs = null, fallback = null } = {}) {
  if (!t) return null;
  if (Number.isFinite(t.day) && Number.isFinite(t.minute)) {
    return simMomentUrl({ custom, scenario, home: t.home,
      day: t.day + 1, t: hhmm(t.minute), follow: followOfRun(runs, t) });
  }
  const mo = fallback
    || (runs && runs[t.home] ? { label: t.home, ...firstMomentOfRun(runs[t.home]) } : null);
  if (!mo) return null;
  return simMomentUrl({ custom, scenario, home: mo.label || t.home,
    day: mo.day, t: mo.t, follow: mo.follow });
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
  const [error, setError] = useState("");
  // 13f: usage lives in the 설정 sheet's 모델 section (usage log).
  const [usageLog, setUsageLog] = useState(() => newUsageLog());
  const [provider, setProvider] = useState("meta");
  const [view, setView] = useState("chat");
  const [serverKeys, setServerKeys] = useState({});
  const [modelErrors, setModelErrors] = useState({});
  const [intake, setIntake] = useState(() => intakeState0());
  const [household, setHousehold] = useState(() => household0());
  const [overrides, setOverrides] = useState(() => defaultOverrides());
  const [namedPhotos, setNamedPhotos] = useState(null);
  const [cardHi, setCardHi] = useState(null);
  const [orbFilter, setOrbFilter] = useState(null);
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
    setMessages((prev) => nextChatMessages(prev, msg, id));
    return id;
  };

  const addToolRow = (row) => {
    const id = row.id || nextId();
    setToolRows((prev) => ({ ...prev, [id]: { ...row, id } }));
    return id;
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
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {},
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
      const merged = applyIntakePatch(prof, { members: patch.members });
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

  async function runSearch(prof, data, { sort }) {
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
    setCandidatesData({ result, tenure, sort });
    pushMsg({ role: "assistant", kind: "candidates", replace: true,
      data: { result, tenure, sort }, example: stateRef.current.exampleId,
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
    saveTranscript({ ...stateRef.current, savedAt: Date.now() });
    window.location.href = chatUrl("", { area: candidate.scene });
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

  async function handleRun() {
    const st = stateRef.current;
    const picked = ((st.candidatesData && st.candidatesData.result.candidates) || [])
      .filter((c) => st.picks.includes(c.id));
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
        content: `살아 보기를 못 하는 집이 있어요: ${blocked.map((c) => `${c.name} (${readinessNote(c)})`).join(" · ")}` });
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
        summary: picked.map((p) => p.name).join(" · "), ms: sc.ms });
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
        names: Object.fromEntries(picked.map((p, i) => [labels[i], p.name])) });
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
        names: Object.fromEntries(picked.map((p, i) => [labels[i], p.name])),
        moneyDoc, moneyMissing, anchors, momentTexts, extraLine, noCommute };
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
    try {
      let byoKey = "";
      try {
        byoKey = loadByoKey(typeof sessionStorage !== "undefined" ? sessionStorage : null, provider);
      } catch { /* no storage — server key path */ }
      const out = await postConsult({ provider, messages: history, scenario: scen,
        context: { ...agentContext(store.getState()), lang: LANG }, byoKey });
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
      for (const m of appended) {
        if (m.role === "system") {
          pushMsg({ role: "system", kind: "system", content: m.content });
        } else if (m.role === "assistant") {
          pushMsg({ role: "assistant", kind: "text", content: m.content || "",
            tool_calls: m.tool_calls || [] });
        }
      }
      appendToolCards(out.messages);
      mergeMoneyResults(out.messages);
      if (out.scenario) setScenario(out.scenario);
      // 13: per-turn usage into the 모델 panel log.
      setUsageLog((log) => recordTurn(log, {
        provider, model: provider,
        input: (out.usage && out.usage.prompt_tokens) || 0,
        output: (out.usage && out.usage.completion_tokens) || 0,
        reasoning: (out.usage && out.usage.reasoning_tokens) || 0,
        latencyMs: out.latencyMs || 0,
      }));
      setModelErrors((e) => ({ ...e, [provider]: null }));
    } catch (err) {
      setModelErrors((e) => ({ ...e, [provider]: {
        httpStatus: err.httpStatus || null, message: String(err.message || err).slice(0, 200),
      } }));
      if (/is not set/.test(err.message)) {
        pushMsg({ role: "assistant", kind: "text", content: NO_KEY_NOTICE });
      } else {
        pushMsg({ role: "assistant", kind: "text", content: `상담 요청 실패: ${err.message}` });
      }
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
    busyRef.current = true;
    setBusy(true);
    setError("");
    pushMsg({ role: "user", kind: "text", content });
    setComposer("");
    try {
      if (/check_listing으로 확인해줘|add_listing_c로 C에 추가해줘|C로 추가해줘/.test(content)) {
        if (IS_DEV) await askAgent(content);
        else {
          pushMsg({ role: "assistant", kind: "text",
            content: "매물 확인은 개발 서버 + 키에서 실거래와 대조해요. 글 읽기는 ’매물 글 붙여 넣기’에서 바로 돼요." });
          pushMsg({ role: "assistant", kind: "listing", data: {} });
        }
      } else if (/공공임대/.test(content)) {
        // 26e: USD runs have no jeonse/public/support data — one line,
        // never the tabs.
        const usd = stateRef.current.profile
          && stateRef.current.profile.currency
          && stateRef.current.profile.currency.value === "USD";
        if (usd) {
          pushMsg({ role: "assistant", kind: "text", content: US_NO_JEONSE_SUPPORT });
        } else if (IS_DEV) await askAgent(content);
        else pushMsg({ role: "assistant", kind: "text", content: NO_KEY_NOTICE });
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
      pushMsg({ id: "greeting", role: "assistant", kind: "text", content: GREETING });
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
    const mem = loadTranscript();
    if (mem && mem.messages && mem.messages.length > 0) {
      idRef.current = mem.messages.length + 10;
      setMessages(mem.messages);
      setToolRows(mem.toolRows || {});
      if (mem.profile) {
        setProfile(mem.profile);
        store.set({ chatSummary: profileSummary(mem.profile) });
      }
      if (mem.candidatesData) setCandidatesData(mem.candidatesData);
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
    pushMsg({ id: "greeting", role: "assistant", kind: "text", content: GREETING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  };

  const summary = profile ? profileSummary(profile) : "";

  return (
    <div className={`ui-chat overlay${view === "work" ? " ui-chat-narrow-work" : ""}`}>
      <AppShell
        variant="surface"
        contentPadding={0}
        topNav={(
          <TopBar mode="chat" summary={summary}
            extra={(
              <div className="ui-chat-narrowtabs">
                <SegmentedControl label="화면 선택" value={view}
                  onChange={setView} size="sm">
                  <SegmentedControlItem value="chat" label="대화" />
                  <SegmentedControlItem value="work" label="화면" />
                </SegmentedControl>
              </div>
            )}
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
        )}>
        <div className="ui-chat-main"
          data-panel={chatMainPanelAttr(detail, compareOpen)}>
          <section className="ui-chat-thread" aria-label="대화">
            <ChatLayout
              density="compact"
              composer={(
                <ChatComposer onSubmit={send} isDisabled={busy}
                  value={composer} onChange={setComposer}
                  placeholder={busy ? "찾는 중…" : "이어서 말씀해 보세요…"} />
              )}>
              <ChatMessageList density="compact">
                {messages.map((m) => (
                  <MsgBoundary key={m.id}>
                    {m.role === "user" ? (
                      <ChatMessage sender="user">
                        <ChatMessageBubble>{m.content}</ChatMessageBubble>
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
                      <Text type="supporting">찾는 중…</Text>
                    </ChatMessageBubble>
                  </ChatMessage>
                )}
              </ChatMessageList>
              <div className="ui-chat-chips" role="group" aria-label="추천 질문">
                {chatChipsFor(profile && profile.currency && profile.currency.value).map((chip) => (
                  <Button key={chip} size="sm" variant="secondary" label={chip}
                    onClick={() => chipAction(chip)} />
                ))}
              </div>
            </ChatLayout>
            {error && (
              <Banner status="error" title="요청 실패" description={error}
                isDismissable onDismiss={() => setError("")} />
            )}
          </section>
          <MsgBoundary>
          <StageArea
            map={buildChatMap({
              regions: dataRef.current?.regionsDoc || { regions: [] },
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
            onPinClick={(id) => {
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
            }}
            onOrbRegion={(regionId) => {
              setOrbFilter(regionId);
              toast.show(`‘${regionId}’ 지역만 보기 — 후보 찾기를 눌러주세요`);
            }} />
          </MsgBoundary>
          <PicksTray picks={picks}
            candidates={(candidatesData && candidatesData.result.candidates) || []}
            gate={runGate(profile)}
            stations={dataRef.current && dataRef.current.network
              ? stationNames(dataRef.current.network) : []}
            onWorkplaceText={handleTrayWorkplace} onNoCommute={handleTrayNoCommute}
            onRun={handleRun} onRemove={handleTogglePick} />
          <SidePanel picks={picks} candidatesData={candidatesData}
            detail={detail} onCloseDetail={() => setDetail(null)}
            photoDeps={handlers.photoDeps} destName={destName}
            tenure={candidatesData?.tenure || "undecided"}
            onTogglePick={handleTogglePick} onJeonse={handleJeonse} />
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

export function StageArea({ map, cardHi, onPinHover, onPinClick, onOrbRegion, contextLine }) {
  const regions = (map && map.regions) || [];
  return (
    <section className="ui-chat-stage" aria-label="중심 무대">
      <div className="ui-chat-stage-body">
        <div className="ui-stage-pill" role="status">
          {contextLine || "출근지를 말하면 후보가 지도에 표시돼요"}
        </div>
        {regions.length > 0 ? (
          <ChatMap map={map} cardHi={cardHi}
            onPinHover={onPinHover} onPinClick={onPinClick} onRegion={onOrbRegion} />
        ) : (
          <div style={{ padding: 16 }}>
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

export function PicksTray({ picks, candidates, onRun, onRemove,
  gate, stations, onWorkplaceText, onNoCommute }) {
  const { picked, canRun, hint } = runReadiness(picks, candidates);
  const [workText, setWorkText] = useState("");
  const [workError, setWorkError] = useState("");
  const workRef = useRef(null);
  if (picked.length === 0) return null;
  const needWorkplace = !!(gate && !gate.ok);
  const label = needWorkplace ? WORKPLACE_ASK_LABEL : RUN_BUTTON_LABEL;
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
    <div className="ui-picks-tray" role="group" aria-label="고른 집">
      <div className="ui-picks-tray-row">
        <div className="ui-picks-tray-chips">
          {picked.map((c, i) => (
            <span key={c.id} className="ui-pick-chip">
              <span className="ui-pick-disc" aria-hidden="true">
                {PICK_LETTERS[i] || "·"}
              </span>
              <span className="ui-pick-name">{c.name}</span>
              <button type="button" className="ui-pick-x"
                aria-label={`${c.name} 빼기`}
                onClick={() => onRemove && onRemove(c)}>×</button>
            </span>
          ))}
        </div>
        <Button label={label} variant="primary"
          isDisabled={!needWorkplace && !canRun}
          onClick={() => {
            if (needWorkplace) {
              if (workRef.current && workRef.current.focus) workRef.current.focus();
              return;
            }
            if (onRun) onRun();
          }} />
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
  detail, onCloseDetail, photoDeps, destName, tenure, onTogglePick, onJeonse }) {
  const candidates = (candidatesData && candidatesData.result.candidates) || [];
  return (
    <>
      <PicksTray picks={picks} candidates={candidates}
        onRun={onRun} onRemove={onTogglePick} />
      <SidePanel picks={picks} candidatesData={candidatesData}
        detail={detail} onCloseDetail={onCloseDetail} photoDeps={photoDeps}
        destName={destName} tenure={tenure}
        onTogglePick={onTogglePick} onJeonse={onJeonse} />
    </>
  );
}
