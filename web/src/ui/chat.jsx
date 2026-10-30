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
import { EmptyState } from "@astryxdesign/core/EmptyState";
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
import { fmtMinutes, fmtWon } from "../money/format.js";
import { myScore, priorityValues } from "../priorities.js";
import { pickMoments } from "../engine/moments.js";
import { oneWayByLabel, oneWayDelta } from "../verify/numbers.js";
import { ShareDialog } from "./share.jsx";
import { JeonseTab } from "./jeonse.jsx";
import { WorthItTab } from "./worthit.jsx";
import { SupportTab } from "./support.jsx";
import { PasteCheck } from "./listings.jsx";
import { HOME_SORTS, HOME_SORT_KO } from "../homes.js";
import { EXAMPLE_PROFILE_LABEL } from "../profile.js";
import { outingsFor, hhmm } from "../timeline.js";
import {
  extractStep, searchStep, searchWithBoxes, scenarioStep, runStep,
  loadHomesIndex, loadNetwork, loadSchedule, loadPhotosManifest,
  loadNamedPhotos, loadRegions, loadPayroll, loadCorridorTiles,
  loadBoxArea, createWorkerRunner, fieldRows, sourceKo,
  profileSummary, missingChips, regionsForNames, simReadyFor,
  homeForScenario, complexNameForCandidate, stationNames,
} from "../chat/engine.js";
import { buildCustomMoneyDoc } from "../chat/custom-money.js";
import { newCustomId, saveCustomRun } from "../chat/idb.js";
import { chatUrl, simMomentUrl, saveTranscript, loadTranscript,
  clearTranscript, parseChatSearch } from "../chat/urls.js";
import { postConsult, loadScenario } from "./consult-client.js";
import { recordedReplyFor } from "./demotour.js";
import { REGION_NAME_ALIASES } from "../region-names.js";
import { agentContext, stripToolLabel, viewSystemLine } from "./agent-float.js";

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
    const known = Array.isArray(v) && v[0] && v[0].resolved;
    out.push(known ? `${by.workplaces.text} 출근` : by.workplaces.text);
  }
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
  const { canRun, hint } = runReadiness(picks, candidates);
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
            {`조건에 맞는 집 ${data.total_matching.toLocaleString()}곳 중 ${candidates.length}곳 보여드려요 · ${data.sort_note || ""}`}
          </Text>
        )}
        {candidates.length === 0 && (
          <Text>조건에 맞는 집이 없어요. 예산·크기·지역을 조금 넓혀 보세요.</Text>
        )}
        {withPhotos.map(({ candidate: c, photos }, i) => (
          <div key={c.id} id={`cand-${c.id}`}
            onMouseEnter={() => onHover && onHover(`home:${c.id}`)}
            onMouseLeave={() => onHover && onHover(null)}
            style={highlightId === `home:${c.id}`
              ? { outline: "2px solid #2f6fed", borderRadius: 12 } : undefined}>
            <VStack gap={1}>
              <CandidateCard candidate={c} tenure={tenure} destName={destName}
                photos={photos} index={i} picked={picks.includes(c.id)}
                onLive={() => onTogglePick(c)}
                onJeonse={() => onJeonse(c)} onDetail={() => onDetail && onDetail(c)} />
              {readinessNote(c) && (
                <Text type="supporting">{`살아 보기 불가: ${readinessNote(c)}`}</Text>
              )}
            </VStack>
          </div>
        ))}
        {candidates.length > 0 && (
          <VStack gap={1}>
            <Button size="sm" label={RUN_BUTTON_LABEL}
              isDisabled={!canRun}
              onClick={() => onRun && onRun()} />
            <Text type="supporting">{hint}</Text>
          </VStack>
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
export function monthlyHousingOf(doc, label, days = 30) {
  const h = doc && doc.homes && doc.homes[label];
  if (!h) return { label, missing: true };
  const t = ((doc.default_tenure || {})[label])
    || (h.by_tenure && Object.keys(h.by_tenure)[0]);
  const sel = h.by_tenure && h.by_tenure[t];
  if (!sel || !sel.housing) return { label, tenure: t || null, missing: true };
  const span = Number(days) > 0 ? Number(days) : 30;
  const totals = sel.totals_by_category || {};
  const maintenance = Math.round(Math.abs(totals.maintenance || 0) * 30 / span);
  const transit = Math.round(Math.abs(totals.transit || 0) * 30 / span);
  const housing = Math.max(0, Math.round(Number(sel.housing.monthly_won) || 0));
  return { label, tenure: t, monthly: housing + maintenance + transit,
    parts: { housing, maintenance, transit }, housingDoc: sel.housing,
    maintenanceWon: maintenance, transitWon: transit };
}

export function commuteOneWayOf(compare) {
  const days = (compare && Number(compare.days) > 0) ? Number(compare.days) : 30;
  const out = [];
  for (const m of (compare && compare.members) || []) {
    const w = m.commute_walk_minutes || {};
    const r = m.commute_ride_minutes || {};
    const total = (Number(w.a) || 0) + (Number(w.b) || 0)
      + (Number(r.a) || 0) + (Number(r.b) || 0);
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
  const texts = data.momentTexts || [];
  const showMoney = !!(data.moneyDoc || data.moneyMissing);
  return (
    <VStack gap={2}>
      {scored.ok && (
        <VStack gap={1}>
          <Text>내 기준 점수</Text>
          {labels.map((l) => (
            <Text key={l} hasTabularNumbers>
              {`${l} ${(names[l] || "").trim()} ${scored.scores[l] === null || scored.scores[l] === undefined ? "–" : `${scored.scores[l]}점`}`.trim()}
            </Text>
          ))}
          <Text type="supporting">{scored.caption}</Text>
        </VStack>
      )}
      {showMoney && (
        <VStack gap={1}>
          <Text>월 주거비 (보증금 기회비용·관리비·교통비)</Text>
          {labels.map((l) => {
            const mh = monthlyHousingOf(data.moneyDoc, l, days);
            if (mh.missing) {
              return (
                <Text key={l} type="supporting">
                  {`${l} 월 주거비: 아직 계산하지 못했어요${data.moneyMissing ? ` · ${data.moneyMissing}` : ""}`}
                </Text>
              );
            }
            return (
              <VStack gap={1} key={l}>
                <Text hasTabularNumbers>{`${l} 월 주거비 ${fmtWon(mh.monthly, { monthly: true })} (${mh.tenure})`}</Text>
                <HowCalculated tenure={mh.tenure} housing={mh.housingDoc}
                  maintenanceWon={mh.maintenanceWon} transitWon={mh.transitWon} />
              </VStack>
            );
          })}
        </VStack>
      )}
      {oneWay ? (
        <VStack gap={1}>
          <Text>출퇴근 편도 (문 앞→회사, 30일 살아 보기)</Text>
          <Text hasTabularNumbers>
            {labels.map((l) => `${l} ${fmtMinutes((data.compare.one_way || {})[l])}`).join(" · ")}
          </Text>
          <Text type="supporting">
            {oneWay.d === 0
              ? `A와 B가 같아요 (편도 평균 ${fmtMinutes(oneWay.a)})`
              : `${oneWay.d > 0 ? "B" : "A"}가 편도 평균 ${fmtMinutes(Math.abs(oneWay.d))} 더 걸려요`}
          </Text>
        </VStack>
      ) : commutes.length > 0 && (
        <VStack gap={1}>
          <Text>하루 출퇴근 (문 앞→회사 편도 평균)</Text>
          {commutes.map((c) => (
            <VStack gap={1} key={c.member}>
              <Text hasTabularNumbers>{`${c.label} A ${fmtMinutes(c.a)} · B ${fmtMinutes(c.b)}`}</Text>
              <Text type="supporting">{c.plain}</Text>
            </VStack>
          ))}
        </VStack>
      )}
      {texts.length > 0 && (
        <VStack gap={1}>
          <Text>살아 보니</Text>
          {texts.map((t, i) => (
            <Text key={i} type="supporting">{`${t.when_ko} ${t.home} — ${t.text_ko}`}</Text>
          ))}
        </VStack>
      )}
    </VStack>
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
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={4}>30일 살아 보기 결과</Heading>
          {example && <Text type="supporting">{EXAMPLE_PROFILE_LABEL}</Text>}
          {data.recorded && <Text type="supporting">기록된 답변</Text>}
        </HStack>
        <Text type="supporting">
          {`${labels.map((l) => `${l} ${(data.names || {})[l] || ""}`.trim()).join(" · ")}`
            + " — 같은 식구가 30일 산 결과예요. 어느 쪽이 나은지는 고객님이 정하세요."}
        </Text>
        <ResultSummary data={data} />
        <details className="ui-section">
          <summary className="ui-section-head">자세히 보기</summary>
          <div className="ui-section-body">
            <CompareTabBody state={{ compare: data.compare, compareLoading: false }} />
          </div>
        </details>
        {data.extraLine && <Text type="supporting">{data.extraLine}</Text>}
        <HStack gap={2} vAlign="center" wrap="wrap">
          {(data.moments || []).map((mo) => (
            <Button key={mo.label} size="sm" variant="secondary"
              label={`${mo.label} 3D에서 보기`}
              onClick={() => {
                window.location.href = simMomentUrl({
                  custom: data.customId, scenario: data.scenario || null,
                  home: mo.label, day: mo.day, t: mo.t, follow: mo.follow,
                });
              }} />
          ))}
        </HStack>
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
  return (
    <VStack gap={2}>
      {took && <Text type="supporting">{took}</Text>}
      {step && !intake.done && (
        <IntakeCard step={step} index={INTAKE_STEPS.indexOf(step)}
          total={INTAKE_STEPS.length}
          value={intake.values[step]} said={Boolean(intake.said[step])}
          onAnswer={handlers.onIntakeAnswer} onSkip={handlers.onIntakeSkip} />
      )}
      <HouseholdCard household={household}
        onAdd={handlers.onHouseholdAdd} onRemove={handlers.onHouseholdRemove} />
      {hhHint && <Text type="supporting">{hhHint}</Text>}
      {profile && (
        <ProfileCard profile={profile} example={handlers.exampleId}
          onChip={handlers.onChip} />
      )}
      <Button size="sm" label="후보 찾기"
        onClick={() => handlers.onFindHomes && handlers.onFindHomes()} />
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
          <SimulationCard data={data} example={msg.example}
            onRetry={handlers.onRun} />
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

const GREETING = [
  "안녕하세요! 집 찾기를 도와드려요.",
  "어디로 출근하고, 누구와 살고, 예산은 얼마인지 편하게 말씀해 주세요.",
  "말씀하신 값으로만 후보를 찾고, 빠진 것은 물어봐요.",
].join("\n");

const NO_KEY_NOTICE = "이 질문은 개발 서버 + 키에서 답해요 (기록된 화면에서는 물음에 답만 해요). 상황·후보·살아 보기는 키 없이도 돼요.";

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
  const found = [];
  for (const words of Object.values(aliases || {})) {
    for (const w of words || []) {
      if (w && src.includes(w)) found.push(w);
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
    setMessages((prev) => {
      // 13: a stable id renders once — the greeting can never double.
      if (msg.id && prev.some((m) => m.id === msg.id)) return prev;
      if (msg.replace && ["profile", "candidates", "simulation", "intake"].includes(msg.kind)) {
        const at = prev.findIndex((m) => m.kind === msg.kind && m.role === "assistant");
        if (at >= 0) {
          const next = [...prev];
          next[at] = { ...msg, id };
          return next;
        }
      }
      return [...prev, { ...msg, id }];
    });
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
    const named = words.length > 0 ? regionsForNames(words) : null;
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
    pushMsg({ role: "assistant", kind: "profile", replace: true,
      data: { profile: prof }, example: stateRef.current.exampleId,
      tool_calls: [{ id: exId, name: "extract_profile" }] });
    if (!profileHasValues(prof)) {
      pushMsg({ role: "assistant", kind: "text",
        content: "어떤 상황인지 조금만 더 알려주세요. 예를 들어 어디로 출근하는지, 전세·월세 중 뭘 보는지, 예산은 얼마인지요." });
      return;
    }
    // 13: after the first message the guided intake pre-fills from the
    // extract and walks the six steps as inline answer cards.
    setIntake(prefillFromExtract(intake, { profile: prof }));
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {} });
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

  async function handleRun() {
    const st = stateRef.current;
    const picked = ((st.candidatesData && st.candidatesData.result.candidates) || [])
      .filter((c) => st.picks.includes(c.id));
    if (picked.length < 2 || !st.profile) return;
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
      const runner = createWorkerRunner(new URL("../sim-worker.js", import.meta.url));
      const { runs, compare, ms } = await runStep(
        (s, l, onP) => runner(s, l, (pg) => setProgress(
          { done: pg.done + 1, total: picked.length + 1, label: pg.label })),
        scenValue, labels);
      const runId = addToolRow({ name: "run_simulation", ok: true,
        summary: `30일 · ${labels.join("·")}`, ms });
      const cmpId = addToolRow({ name: "compare", ok: true,
        summary: `${compare.metrics.length}개 지표`, ms: 0 });
      // 18: the run's own money doc, built in the browser from the
      // picked candidates' 실거래 — never another scenario's file.
      // A build failure keeps the 30-day runs and reports the money
      // as missing (with its reason), never demo numbers.
      setProgress({ done: picked.length + 1, total: picked.length + 2, label: "돈 계산" });
      let moneyDoc = null;
      let moneyMissing = "";
      try {
        const payroll = await loadPayroll(fetchJson);
        if (!payroll) throw new Error("급여 요율표를 불러오지 못했어요");
        moneyDoc = buildCustomMoneyDoc({
          scenario: scenValue, runs, profile: st.profile,
          picked: picked.map((p, i) => ({ label: labels[i], candidate: p,
            complexName: homes[i].name, areaId: p.scene })),
          payrollTable: payroll, areas,
          network: data.network || null, fareSchedule: data.schedule || null,
        });
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
            .map((m) => ({ home: m.home, when_ko: m.when_ko, text_ko: m.text_ko }));
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
        moneyDoc, moneyMissing, anchors, momentTexts, extraLine };
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
        context: agentContext(store.getState()), byoKey });
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
        if (IS_DEV) await askAgent(content);
        else pushMsg({ role: "assistant", kind: "text", content: NO_KEY_NOTICE });
      } else if (/전세 점검/.test(content)) {
        store.set({ compareOpen: true, compareTab: "jeonse" });
        pushMsg({ role: "assistant", kind: "tab", data: { tab: "jeonse" } });
      } else if (/살 만한/.test(content)) {
        store.set({ compareOpen: true, compareTab: "worthit" });
        pushMsg({ role: "assistant", kind: "tab", data: { tab: "worthit" } });
      } else if (/도움 제도|도움제도|지원 제도|정책 대출|혜택/.test(content)) {
        store.set({ compareOpen: true, compareTab: "support" });
        pushMsg({ role: "assistant", kind: "tab", data: { tab: "support" } });
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
  const destName = (profile && profile.workplaces && profile.workplaces.value
    && profile.workplaces.value[0] && profile.workplaces.value[0].resolved
    && profile.workplaces.value[0].resolved.station) || "";

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
              onRestart: () => { clearTranscript(); window.location.href = "/"; },
            }} />
        )}>
        <div className="ui-chat-main">
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
            </ChatLayout>
            {error && (
              <Banner status="error" title="요청 실패" description={error}
                isDismissable onDismiss={() => setError("")} />
            )}
            <div className="ui-chat-chips" role="group" aria-label="추천 질문">
              {CHAT_CHIPS.map((chip) => (
                <Button key={chip} size="sm" variant="secondary" label={chip}
                  onClick={() => chipAction(chip)} />
              ))}
            </div>
            {(() => {
              const sticky = runReadiness(picks,
                (candidatesData && candidatesData.result.candidates) || []);
              return sticky.picked.length >= 2 ? (
                <div className="ui-chat-sticky-run">
                  <Button label={RUN_BUTTON_LABEL}
                    isDisabled={!sticky.canRun}
                    onClick={() => handleRun()} />
                  {!sticky.canRun && (
                    <Text type="supporting">{sticky.hint}</Text>
                  )}
                </div>
              ) : null;
            })()}
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
          <DrawerArea picks={picks} candidatesData={candidatesData} onRun={handleRun}
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
      <div style={{ padding: "8px 12px", background: "rgba(255,253,248,0.98)",
        borderBottom: "1px solid var(--border, #d8d2c4)" }}>
        <Text type="supporting">
          {contextLine || "출근지를 말하면 후보가 지도에 표시돼요"}
          {" · "}
          {regions.length > 0 ? `지역 ${regions.length}곳` : "지역을 불러오는 중…"}
        </Text>
      </div>
      <div className="ui-chat-stage-body">
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

export function DrawerArea({ picks, candidatesData, onRun,
  detail, onCloseDetail, photoDeps, destName, tenure, onTogglePick, onJeonse }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const candidates = (candidatesData && candidatesData.result.candidates) || [];
  // Same verdict + same handler as the chat card (runReadiness).
  const { picked, canRun, hint } = runReadiness(picks, candidates);
  const open = Boolean(detail || state.compareOpen || picked.length > 0);
  const detailPhotos = detail
    ? selectPhotosForList([detail], photoDeps || {})[0].photos : null;
  return (
    <aside className="ui-chat-drawer" data-open={open ? "true" : "false"} aria-label="상세 패널">
      <div className="ui-chat-drawer-inner">
        {detail && (
          <Card padding={3}>
            <VStack gap={2}>
              <HStack gap={1} vAlign="center">
                <Heading level={4}>자세히</Heading>
                <span className="ui-panel-spacer" />
                <Button size="sm" variant="ghost" label="닫기" onClick={onCloseDetail} />
              </HStack>
              <CandidateCard candidate={detail} tenure={tenure} destName={destName}
                photos={detailPhotos} picked={picks.includes(detail.id)}
                onLive={() => onTogglePick(detail)}
                onJeonse={() => onJeonse(detail)} onDetail={null} />
            </VStack>
          </Card>
        )}
        {picked.length > 0 && (
          <Card padding={3}>
            <VStack gap={1}>
              <Heading level={4}>{`고른 집 ${picked.length}곳`}</Heading>
              {picked.map((c) => (
                <Text key={c.id}>{c.name}</Text>
              ))}
              <Button size="sm" label={RUN_BUTTON_LABEL}
                isDisabled={!canRun} onClick={() => onRun && onRun()} />
              <Text type="supporting">{hint}</Text>
            </VStack>
          </Card>
        )}
        <CompareCard state={state} />
        {!detail && picked.length === 0 && !state.compareOpen && (
          <EmptyState isCompact title="대화에서 집을 고르면"
            description="여기에 고른 집과 비교·돈·안심·매물 탭이 열려요." />
        )}
      </div>
    </aside>
  );
}
