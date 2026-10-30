// Entry screen (12b, A; 19f: visible city, heading first, steps,
// white example cards). A question over the map: the 3D canvas behind
// (tour scene, slowly drifting) shows through a radial veil — calm
// white in the middle, city visible at the edges.
//
// Suggestion cards fill example prompts (labelled 예시) or open the
// listing paste check; sending moves to the chat (?chat=…).
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Popover } from "@astryxdesign/core/Popover";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { chatUrl } from "../chat/urls.js";
import { LangToggle } from "./lang-toggle.jsx";

export const LANDING_BRAND = "Ithaca · The Pre-living Agent for Your Next Home";
export const LANDING_TAGLINE = "We walk the odyssey. You just come home.";
export const LANDING_HEADING = "계약 전에, 그 집에서 30일 먼저 살아 봐요";
export const LANDING_SUB = "출근·돈·생활을 진짜 자료로 미리 살아 보고, 직접 고르세요";
export const LANDING_PLACEHOLDER = "어디로 출근하고, 누구와 살고, 예산은 얼마인가요?";

// The three personas as fillable example prompts (each labelled 예시).
export const EXAMPLE_PROMPTS = [
  { id: "single-firstjob",
    title: "1인 사회초년생",
    prompt: "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하" },
  { id: "newlywed-couple",
    title: "예비·신혼부부",
    prompt: "맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상" },
  { id: "dual-income-child",
    title: "맞벌이 + 초등학생 자녀",
    prompt: "맞벌이에 초등학생 아이 1명, 잠실 출근, 전세 6억 이하, 초등학교 도보 10분" },
  { id: "us-meta",
    title: "Meta HQ, Menlo Park (US)",
    prompt: "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month" },
];

export const LANDING_STEPS = [
  "말로 조건 말하기",
  "지도에서 후보 2곳 담기",
  "30일 살아 보고 비교",
];

// The user's 11 area names (12a brief): coverage line under the cards.
export const COVERAGE_AREAS = ["서울 성동", "송파", "강남", "강동", "위례",
  "판교", "성남", "정자", "분당", "미금", "수지"];

export const COVERAGE_LINE = `다루는 지역 ${COVERAGE_AREAS.length}곳: ${COVERAGE_AREAS.join(" · ")}`;

// 26w: the US coverage line, reused by the chat-first empty screen.
export const COVERAGE_US_LINE = "미국 1곳: Menlo Park · Meta HQ (자전거·도보, Zillow 월세 추정)";

const SOURCES = [
  "집값·전세: 국토교통부 실거래가 공개시스템 (최근 12개월, 참고용)",
  "집 위치·모양: OpenStreetMap + GIS건물통합정보 (국토교통부/VWorld)",
  "타는 시간: 서울교통공사 표준 운행시간, 없으면 1~8호선 평균 속도로 추정",
  "붐비는 정도: 서울교통공사 지하철혼잡도정보 (실측 표시가 없을 땐 가정값)",
  "주변 사진: Wikimedia Commons (자유 라이선스, 매물 사진 아님)",
  "치안·학교: 경찰청·교육부 공식 통계만 (출처·기간·단위와 함께 표시)",
  "미국 월세: Zillow Observed Rent Index (ZIP 단위 추정, 매물 가격 아님) · 지도·항공사진: USGS The National Map",
];

function SourcesPopover() {
  const [open, setOpen] = useState(false);
  return (
    <Popover placement="above" alignment="center" label="데이터 출처"
      isOpen={open} onOpenChange={setOpen}
      content={(
        <VStack gap={1}>
          {SOURCES.map((s) => (
            <Text key={s} type="supporting">{s}</Text>
          ))}
        </VStack>
      )}>
      <Button size="sm" variant="ghost" label="데이터 출처" onClick={() => setOpen(!open)} />
    </Popover>
  );
}

function goChat(message, extra) {
  window.location.href = chatUrl(message, extra);
}

// 18: an example chip sends immediately (labelled 예시) — no second tap.
export function exampleChatUrl(prompt) {
  const matches = EXAMPLE_PROMPTS.find((p) => p.prompt === prompt);
  return chatUrl(prompt, matches ? { example: matches.id } : {});
}

export function Landing() {
  const [value, setValue] = useState("");
  const [exampleId, setExampleId] = useState(null);
  const submit = (text) => {
    const content = String(text || "").trim();
    if (!content) return;
    const matches = EXAMPLE_PROMPTS.find((p) => p.prompt === content);
    goChat(content, matches ? { example: matches.id } : (exampleId ? { example: exampleId } : {}));
  };
  return (
    <div className="ui-landing overlay">
      <div className="ui-landing-scrim" aria-hidden="true" />
      <div className="ui-landing-body">
        <div className="ui-landing-brand">
          <span className="ui-landing-brandname">Ithaca</span>
          <span className="ui-landing-brandtag">{LANDING_TAGLINE}</span>
          <LangToggle />
        </div>
        <Layout
          height="fill"
          contentWidth={720}
          padding={6}
          content={(
            <LayoutContent>
              <VStack gap={8} vAlign="center" style={{ minHeight: "100%" }}>
                <div>
                  <h1 className="ui-landing-heading">{LANDING_HEADING}</h1>
                  <p className="ui-landing-sub">{LANDING_SUB}</p>
                </div>
                <ChatComposer
                  onSubmit={submit}
                  value={value}
                  onChange={(v) => { setValue(v); setExampleId(null); }}
                  placeholder={LANDING_PLACEHOLDER}
                />
                <ol className="ui-landing-steps">
                  {LANDING_STEPS.map((step, i) => (
                    <li key={step} style={{ display: "contents" }}>
                      {i > 0 ? <span className="ui-landing-stepsep" aria-hidden="true">›</span> : null}
                      <span className="ui-landing-step">
                        <span className="ui-landing-stepnum" aria-hidden="true">{i + 1}</span>
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
                <VStack gap={3}>
                  <div className="ui-landing-cards">
                    {EXAMPLE_PROMPTS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="ui-landing-card"
                        aria-label={`${p.title} 예시로 시작하기`}
                        onClick={() => { window.location.href = exampleChatUrl(p.prompt); }}>
                        <span className="ui-landing-cardtop">
                          <span className="ui-landing-cardtitle">{p.title}</span>
                          <span className="ui-landing-cardchip">예시</span>
                        </span>
                        <p className="ui-landing-cardprompt">{p.prompt}</p>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ui-landing-card"
                      aria-label="매물 글 붙여 넣기로 시작하기"
                      onClick={() => { window.location.href = chatUrl("", { listing: "1" }); }}>
                      <span className="ui-landing-cardtop">
                        <span className="ui-landing-cardtitle">매물 글 붙여 넣기</span>
                      </span>
                      <p className="ui-landing-cardprompt">
                        본 매물 글을 붙여 넣으면 실거래와 비교해 드려요
                      </p>
                    </button>
                  </div>
                  <div className="ui-landing-foot">
                    <span>{COVERAGE_LINE}<br />{COVERAGE_US_LINE}</span>
                    <span aria-hidden="true"> · </span>
                    <SourcesPopover />
                  </div>
                </VStack>
              </VStack>
            </LayoutContent>
          )}
        />
      </div>
    </div>
  );
}
