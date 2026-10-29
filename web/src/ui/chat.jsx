// Conversation view (12b, B): the chat replaces the floating agent.
// Shell from shell-top-nav (AppShell + TopNav: product name, profile
// chip, 새로 시작), transcript from ai-chat (ChatLayout + message list
// + composer, chat column ≈440px, work area right). Template sample
// content (JWT doc, shop items, artifact panel) is removed; the work
// area is our 3D scene + candidate/result cards.
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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
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
import { ModelPanel } from "./model-panel.jsx";
import { SourcesDrawer } from "./sources.jsx";
import { AssumptionsPanel } from "./assumptions.jsx";
import { OrbView } from "./orb.jsx";
import { toast, Toaster } from "./toast.jsx";
import {
  INTAKE_STEPS, intakeState0, currentStep, prefillFromExtract,
  answerStep, skipStep, household0, addMember, removeMember,
  intakeToProfilePatch,
} from "../intake.js";
import { selectPhotosForList } from "../places/select-photos.js";
import { newUsageLog, recordTurn } from "../models/catalog.js";
import { loadByoKey } from "../consult/byok.js";
import { buildOrbData } from "../orb.js";
import { defaultOverrides, setOverride, resetOverride,
  encodeOverrides, decodeOverrides } from "../assumptions.js";
// Cycle with app.jsx (it renders ChatScreen): render-time use only,
// so module evaluation order is safe.
import { CompareCard, CompareTabBody } from "./app.jsx";
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
  loadNamedPhotos, loadRegions,
  loadBoxArea, createWorkerRunner, fieldRows, sourceKo,
  profileSummary, missingChips, regionsForNames, simReadyFor,
  homeForScenario, complexNameForCandidate, stationNames,
} from "../chat/engine.js";
import { newCustomId, saveCustomRun } from "../chat/idb.js";
import { chatUrl, simMomentUrl, saveTranscript, loadTranscript,
  clearTranscript, parseChatSearch } from "../chat/urls.js";
import { postConsult, loadScenario, formatUsage } from "./consult-client.js";
import { recordedReplyFor } from "./demotour.js";
import { REGION_NAME_ALIASES } from "../region-names.js";
import { agentContext, viewSystemLine } from "./agent-float.js";

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

export function ProfileCard({ profile, example, onChip }) {
  const rows = fieldRows(profile);
  const chips = missingChips(profile);
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>고객님 상황</Heading>
          {example && <Badge variant="yellow" label={EXAMPLE_PROFILE_LABEL} />}
        </HStack>
        <MetadataList>
          {rows.map((r) => (
            <MetadataListItem key={r.key} label={r.label}>
              <VStack gap={0}>
                <HStack gap={1} vAlign="center" wrap="wrap">
                  <Text hasTabularNumbers>{r.text}</Text>
                  {sourceKo(r.source) !== "" && (
                    <Badge variant={r.source === "asked" ? "neutral" : "blue"}
                      label={sourceKo(r.source)} />
                  )}
                </HStack>
                {r.note && r.note !== r.label && r.note !== r.text && (
                  <Text type="supporting">{r.note}</Text>
                )}
              </VStack>
            </MetadataListItem>
          ))}
        </MetadataList>
        {chips.length > 0 && (
          <VStack gap={1}>
            <Text type="supporting">빠진 것을 채우면 후보가 더 정확해져요</Text>
            <HStack gap={1} vAlign="center" wrap="wrap">
              {chips.map((c) => (
                <Button key={c.field} size="sm" variant="secondary"
                  label={CHIP_SHORT[c.field] || c.ask}
                  onClick={() => onChip && onChip(c.field, CHIP_STARTER[c.field] || "")} />
              ))}
            </HStack>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// --- CandidatesCard ------------------------------------------------------------------

function readinessNote(candidate) {
  const r = simReadyFor(candidate, null);
  return r.ready ? "" : r.reason;
}

export function CandidatesCard({ data, tenure, sort, onSort, picks, onTogglePick,
    onPreview3D, onJeonse, onRun, onDetail, onHover, photoDeps, destName, example }) {
  const candidates = (data && data.candidates) || [];
  const picked = candidates.filter((c) => picks.includes(c.id));
  const unready = picked.filter((c) => readinessNote(c));
  const canRun = picked.length >= 2 && unready.length === 0;
  // 13: one photo per card at most — dedup across the whole list.
  const withPhotos = selectPhotosForList(candidates, photoDeps || {});
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={4}>{`집 후보 ${candidates.length}곳`}</Heading>
          {example && <Badge variant="yellow" label={EXAMPLE_PROFILE_LABEL} />}
          <span className="ui-panel-spacer" />
          <DropdownMenu
            button={{ label: HOME_SORT_KO[sort] || sort, variant: "ghost", size: "sm" }}
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
          <div key={c.id}
            onMouseEnter={() => onHover && onHover(`home:${c.id}`)}
            onMouseLeave={() => onHover && onHover(null)}>
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
            <Button size="sm" label="이 집들로 살아 보기"
              isDisabled={!canRun}
              onClick={() => onRun && onRun()} />
            <Text type="supporting">
              {picked.length < 2
                ? `비교에 넣기로 2–3곳을 골라주세요 (지금 ${picked.length}곳)`
                : unready.length > 0
                  ? `살아 보기를 못 하는 집이 있어요 (${unready.map((c) => c.name).join("·")})`
                  : `${picked.length}곳을 30일씩 살아 보고 비교해 드려요`}
            </Text>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// --- SimulationCard ---------------------------------------------------------------------

function AnchorNotes({ anchors }) {
  const coord = (anchors || []).filter((a) => a && a.method === "coordinate");
  if (coord.length === 0) return null;
  return (
    <Text type="supporting">
      {`${coord.map((a) => a.label).join("·")} — 장면에 단지 이름이 없어 집 위치에서 시작했어요`}
    </Text>
  );
}

export function SimulationCard({ data, example }) {
  if (!data) return null;
  if (data.status === "running") {
    const p = data.progress || { done: 0, total: 1, label: "" };
    return (
      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={1} vAlign="center">
            <Heading level={4}>30일 살아 보는 중</Heading>
            {example && <Badge variant="yellow" label={EXAMPLE_PROFILE_LABEL} />}
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
          <Banner status="warning" title="실행하지 못했어요" description={data.error || ""} />
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
          {example && <Badge variant="yellow" label={EXAMPLE_PROFILE_LABEL} />}
          {data.recorded && <Badge variant="yellow" label="기록된 답변" />}
        </HStack>
        <Text type="supporting">
          {`${labels.map((l) => `${l} ${(data.names || {})[l] || ""}`.trim()).join(" · ")}`
            + " — 같은 식구가 30일 산 결과예요. 어느 쪽이 나은지는 고객님이 정하세요."}
        </Text>
        <CompareTabBody state={{ compare: data.compare, compareLoading: false }} />
        <AnchorNotes anchors={data.anchors} />
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
        <Heading level={4}>{TAB_TITLES[tab] || tab}</Heading>
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
  return (
    <VStack gap={2}>
      {step && !intake.done && (
        <IntakeCard step={step} index={INTAKE_STEPS.indexOf(step)}
          total={INTAKE_STEPS.length}
          value={intake.values[step]} said={Boolean(intake.said[step])}
          onAnswer={handlers.onIntakeAnswer} onSkip={handlers.onIntakeSkip} />
      )}
      <HouseholdCard household={household}
        onAdd={handlers.onHouseholdAdd} onRemove={handlers.onHouseholdRemove} />
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

function CardMsg({ msg, handlers, toolRows }) {
  const { data } = msg;
  const rows = (msg.tool_calls || []).map((c) => toolRows[c.id]).filter(Boolean);
  const tools = (msg.tool_calls || []).map((c) => c.name);
  return (
    <ChatMessage sender="assistant" avatar={<Avatar name="상담" size="md" />}>
      {msg.recorded && (
        <ChatMessageBubble variant="ghost" width="100%">
          <Badge variant="yellow" label="기록된 답변" />
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
            destName={handlers.destName} example={msg.example} />
        )}
        {msg.kind === "intake" && (
          <IntakeFlowCard intake={handlers.intake} household={handlers.household}
            profile={handlers.profile} handlers={handlers} />
        )}
        {msg.kind === "simulation" && (
          <SimulationCard data={data} example={msg.example} />
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
            {rec && <Badge variant="yellow" label="기록된 답변" />}
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
  const [usage, setUsage] = useState({ prompt_tokens: 0, completion_tokens: 0, est_usd: 0 });
  // 13: the loose token line moves into the 모델 panel as a usage log.
  const [usageLog, setUsageLog] = useState(() => newUsageLog());
  const [provider, setProvider] = useState("meta");
  const [view, setView] = useState("chat");
  const [panel, setPanel] = useState(null); // null | model | sources | assume
  const [serverKeys, setServerKeys] = useState({});
  const [modelErrors, setModelErrors] = useState({});
  const [intake, setIntake] = useState(() => intakeState0());
  const [household, setHousehold] = useState(() => household0());
  const [overrides, setOverrides] = useState(() => defaultOverrides());
  const [namedPhotos, setNamedPhotos] = useState(null);
  const [cardHi, setCardHi] = useState(null);
  const [orbFilter, setOrbFilter] = useState(null);
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
      summary: ex.value.ok ? "상황 읽기" : "읽기 실패", ms: ex.ms });
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
      summary: `집 후보 ${result.candidates.length}곳(정렬: ${HOME_SORT_KO[sort]})`, ms });
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
      const homes = picked.map((p) => homeForScenario(p,
        complexNameForCandidate(p, areas.get(p.scene)) || p.name));
      const sc = await scenarioStep(fetchJson, st.profile, homes, { ...data, areas });
      const scenValue = sc.value;
      setScenario(scenValue);
      const buildId = addToolRow({ name: "build_scenario", ok: true,
        summary: `시나리오 (${picked.map((p) => p.name).join(" · ")})`, ms: sc.ms });
      const labels = picked.map((_, i) => "ABC"[i]);
      const runner = createWorkerRunner(new URL("../sim-worker.js", import.meta.url));
      const { runs, compare, ms } = await runStep(
        (s, l, onP) => runner(s, l, (pg) => setProgress(
          { done: pg.done + 1, total: picked.length + 1, label: pg.label })),
        scenValue, labels);
      const runId = addToolRow({ name: "run_simulation", ok: true,
        summary: `30일 실행 (${labels.join("·")})`, ms });
      const cmpId = addToolRow({ name: "compare", ok: true,
        summary: `비교 (${compare.metrics.length}개 지표)`, ms: 0 });
      const customId = newCustomId();
      await saveCustomRun({ id: customId, scenario: scenValue, runs, labels,
        names: Object.fromEntries(picked.map((p, i) => [labels[i], p.name])) });
      const moments = labels.map((l) => ({ label: l, ...firstMomentOfRun(runs[l]) }));
      const anchors = labels.map((l) => ({ label: l,
        method: (runs[l].meta.home_anchor || {}).method || "complex" }));
      let extraLine = "";
      if (labels.length > 2) {
        const third = runs[labels[2]];
        const hh = third.household || {};
        extraLine = `${labels[2]} ${(third.meta || {}).complex || ""}: `
          + `30일 동안 ${Math.round(hh.walk_minutes || 0)}분 걷고, `
          + `평균 피곤한 정도 ${Math.round((hh.fatigue_avg_30d || 0) * 10) / 10} — 3D에서 보기로 하루를 보세요.`;
      }
      const payload = { status: "done", compare, moments, labels, customId,
        names: Object.fromEntries(picked.map((p, i) => [labels[i], p.name])),
        anchors, extraLine };
      store.set({ compare });
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
      setUsage((u) => ({
        prompt_tokens: u.prompt_tokens + ((out.usage && out.usage.prompt_tokens) || 0),
        completion_tokens: u.completion_tokens + ((out.usage && out.usage.completion_tokens) || 0),
        est_usd: u.est_usd + ((out.usage && out.usage.est_usd) || 0),
      }));
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
            summary: t.summary || "", ms: t.ms || 0 });
          return { id, name: t.name };
        });
        pushMsg({ role: "assistant", kind: "text", content: rec.a,
          recorded: true, tool_calls: calls });
        if (initial.example) {
          pushMsg({ role: "system", kind: "system",
            content: `예시로 시작했어요 (${initial.example})` });
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
          content: `예시로 시작했어요 (${initial.example})` });
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
          <TopNav
            label="주거 시뮬레이터 대화"
            heading={(
              <TopNavHeading heading="주거 시뮬레이터" headingHref="/" />
            )}
            centerContent={(
              summary ? <Badge variant="info" label={summary} /> : (
                <Text type="supporting">상황을 알려주세요</Text>
              )
            )}
            endContent={(
              <>
                <div className="ui-chat-narrowtabs">
                  <SegmentedControl label="화면 선택" value={view}
                    onChange={setView} size="sm">
                    <SegmentedControlItem value="chat" label="대화" />
                    <SegmentedControlItem value="work" label="화면" />
                  </SegmentedControl>
                </div>
                <span className="ui-token ui-num" title="이번 대화 토큰 사용량 (추정)">
                  {formatUsage(usage)}
                </span>
                {IS_DEV && (
                  <DropdownMenu
                    button={{ label: provider === "meta" ? "Spark 1.3" : "Spark Open",
                      variant: "ghost", size: "sm" }}
                    menuWidth={240}
                    items={[
                      { label: "Spark 1.3 (Muse Spark 1.3)", onClick: () => setProvider("meta") },
                      { label: "Spark Open (Muse Spark Open)", onClick: () => setProvider("baseten") },
                    ]} />
                )}
                <Button size="sm" variant="ghost" label="모델"
                  onClick={() => setPanel(panel === "model" ? null : "model")} />
                <Button size="sm" variant="ghost" label="가정 바꾸기"
                  onClick={() => setPanel(panel === "assume" ? null : "assume")} />
                <Button size="sm" variant="ghost" label="출처·라이선스"
                  onClick={() => setPanel(panel === "sources" ? null : "sources")} />
                <Button size="sm" variant="ghost" label="새로 시작"
                  onClick={() => { clearTranscript(); window.location.href = "/"; }} />
              </>
            )}
          />
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
                {messages.map((m) => (m.role === "user" ? (
                  <ChatMessage key={m.id} sender="user">
                    <ChatMessageBubble>{m.content}</ChatMessageBubble>
                  </ChatMessage>
                ) : m.role === "system" ? (
                  <ChatSystemMessage key={m.id}>{m.content}</ChatSystemMessage>
                ) : m.kind === "text" ? (
                  <AssistantMsg key={m.id} msg={m} toolRows={toolRows} />
                ) : (
                  <CardMsg key={m.id} msg={m} handlers={handlers} toolRows={toolRows} />
                )))}
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
          </section>
          <StageArea
            orbData={buildOrbData({
              regions: dataRef.current?.regionsDoc || { regions: [] },
              stations: [],
              homes: dataRef.current?.index?.homes || [],
              candidates: candidatesData?.result?.candidates || [],
              manifest: dataRef.current?.manifest || null,
              rentalCoverage: {},
            })}
            cardHi={cardHi}
            onOrbRegion={(regionId) => {
              setOrbFilter(regionId);
              toast.show(`‘${regionId}’ 지역만 보기 — 후보 찾기를 눌러주세요`);
            }} />
          <DrawerArea picks={picks} candidatesData={candidatesData} onRun={handleRun}
            panel={panel} onClosePanel={() => setPanel(null)}
            usageLog={usageLog} serverKeys={serverKeys} modelErrors={modelErrors}
            overrides={overrides}
            onSetOverride={(id, v) => setOverrides((o) => setOverride(o, id, v))}
            onResetOverride={(id) => setOverrides((o) => resetOverride(o, id))}
            detail={detail} onCloseDetail={() => setDetail(null)}
            photoDeps={handlers.photoDeps} destName={destName}
            tenure={candidatesData?.tenure || "undecided"}
            onTogglePick={handleTogglePick} onJeonse={handleJeonse} />
        </div>
        {viewChip && (
          <div className="ui-viewchip overlay">
            <Badge variant="info" label={viewChip} />
          </div>
        )}
        <Toaster />
      </AppShell>
    </div>
  );
}

function StageArea({ orbData, cardHi, onOrbRegion }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const shapes = (orbData && orbData.shapes) || [];
  return (
    <section className="ui-chat-stage" aria-label="중심 무대">
      <div style={{ padding: "8px 12px", background: "rgba(255,253,248,0.98)",
        borderBottom: "1px solid var(--border, #d8d2c4)" }}>
        <Text type="supporting">
          {`지금 보는 장면 · ${state.area.label || state.area.id || "서울·경기 동남부"}`}
          {" · "}
          {shapes.length > 0 ? `지역 ${shapes.length}곳` : "지역을 불러오는 중…"}
        </Text>
      </div>
      <div className="ui-chat-stage-body">
        {shapes.length > 0 ? (
          <OrbView data={orbData} onRegion={onOrbRegion} highlightKey={cardHi} />
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

function DrawerArea({ picks, candidatesData, onRun, panel, onClosePanel,
  usageLog, serverKeys, modelErrors, overrides, onSetOverride, onResetOverride,
  detail, onCloseDetail, photoDeps, destName, tenure, onTogglePick, onJeonse }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const candidates = (candidatesData && candidatesData.result.candidates) || [];
  const picked = candidates.filter((c) => picks.includes(c.id));
  const open = Boolean(detail || panel || state.compareOpen || picked.length > 0);
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
        {panel === "model" && (
          <ModelPanel usageLog={usageLog} serverKeys={serverKeys}
            errors={modelErrors} onClose={onClosePanel} />
        )}
        {panel === "sources" && <SourcesDrawer onClose={onClosePanel} />}
        {panel === "assume" && (
          <AssumptionsPanel overrides={overrides}
            onSet={onSetOverride} onReset={onResetOverride} onClose={onClosePanel} />
        )}
        {picked.length > 0 && (
          <Card padding={3}>
            <VStack gap={1}>
              <Heading level={4}>{`고른 집 ${picked.length}곳`}</Heading>
              {picked.map((c) => (
                <Text key={c.id}>{c.name}</Text>
              ))}
              <Button size="sm" label="이 집들로 살아 보기"
                isDisabled={picked.length < 2} onClick={onRun} />
            </VStack>
          </Card>
        )}
        <CompareCard state={state} />
        {!detail && !panel && picked.length === 0 && !state.compareOpen && (
          <EmptyState isCompact title="대화에서 집을 고르면"
            description="여기에 고른 집과 비교·돈·안심·매물 탭이 열려요." />
        )}
      </div>
    </aside>
  );
}
