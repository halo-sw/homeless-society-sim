// Entry screen (12b, A): a question over the map. Ported from the
// ai-chat-landing template (Layout + greeting + ChatComposer +
// ClickableCard grid) with the template's sample content removed — no
// categories, modes, mentions or attachments. The 3D canvas behind
// (tour scene, slowly drifting) is dimmed by the scrim div so the
// white text keeps ≥ 4.5:1 contrast.
//
// Suggestion cards fill example prompts (labelled 예시) or open the
// listing paste check; sending moves to the chat (?chat=…).
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { Popover } from "@astryxdesign/core/Popover";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { chatUrl } from "../chat/urls.js";

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
];

// The user's 11 area names (12a brief): coverage line under the cards.
export const COVERAGE_AREAS = ["서울 성동", "송파", "강남", "강동", "위례",
  "판교", "성남", "정자", "분당", "미금", "수지"];

export const COVERAGE_LINE = `다루는 지역 ${COVERAGE_AREAS.length}곳: ${COVERAGE_AREAS.join(" · ")}`;

const SOURCES = [
  "집값·전세: 국토교통부 실거래가 공개시스템 (최근 12개월, 참고용)",
  "집 위치·모양: OpenStreetMap + GIS건물통합정보 (국토교통부/VWorld)",
  "타는 시간: 서울교통공사 표준 운행시간, 없으면 1~8호선 평균 속도로 추정",
  "붐비는 정도: 서울교통공사 지하철혼잡도정보 (실측 표시가 없을 땐 가정값)",
  "주변 사진: Wikimedia Commons (자유 라이선스, 매물 사진 아님)",
  "치안·학교: 경찰청·교육부 공식 통계만 (출처·기간·단위와 함께 표시)",
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
        <Layout
          height="fill"
          contentWidth={720}
          padding={6}
          content={(
            <LayoutContent>
              <VStack gap={8} vAlign="center" style={{ minHeight: "100%" }}>
                <VStack gap={1}>
                  <Text type="large" as="h2">{LANDING_SUB}</Text>
                  <Text type="display-2" as="h1">{LANDING_HEADING}</Text>
                </VStack>
                <ChatComposer
                  onSubmit={submit}
                  value={value}
                  onChange={(v) => { setValue(v); setExampleId(null); }}
                  placeholder={LANDING_PLACEHOLDER}
                />
                <VStack gap={3}>
                  <Grid columns={{ minWidth: 280 }} gap={3}>
                    {EXAMPLE_PROMPTS.map((p) => (
                      <ClickableCard
                        key={p.id}
                        label={`${p.title} 예시로 채우기`}
                        variant="muted"
                        padding={3}
                        onClick={() => { setValue(p.prompt); setExampleId(p.id); }}>
                        <VStack gap={0.5}>
                          <HStack gap={1} vAlign="center">
                            <Heading level={4}>{p.title}</Heading>
                            <Badge variant="yellow" label="예시" />
                          </HStack>
                          <Text type="body" color="secondary" size="xsm">{p.prompt}</Text>
                        </VStack>
                      </ClickableCard>
                    ))}
                    <ClickableCard
                      label="매물 글 붙여 넣기로 시작하기"
                      variant="muted"
                      padding={3}
                      onClick={() => { window.location.href = chatUrl("", { listing: "1" }); }}>
                      <VStack gap={0.5}>
                        <Heading level={4}>매물 글 붙여 넣기</Heading>
                        <Text type="body" color="secondary" size="xsm">
                          본 매물 글을 붙여 넣으면 실거래와 비교해 드려요
                        </Text>
                      </VStack>
                    </ClickableCard>
                  </Grid>
                  <div className="ui-landing-foot">
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Text type="supporting">{COVERAGE_LINE}</Text>
                      <SourcesPopover />
                    </HStack>
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
