// 전세 안전 점검 tab (React, Astryx). Public-data signals (전세가율,
// register fields), the official checklist, and clearly labelled 모의
// loss scenarios. Never "이 집은 안전/위험" — signals, missing
// information, and the checklist only.
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { fmtWon, badgeFor } from "../money/format.js";
import { MOCKLOSS_PATH_KO, MOCKLOSS_LEGAL_NOTE, mockDepositLoss } from "../money/mockloss.js";

const MOCKLOSS_DEFAULTS = {
  insured_months: 2, insured_pct: 100,
  auction_months: 12, auction_pct: 70, unrecovered_pct: 0,
};

function SrcBadge({ source }) {
  return (
    <Badge variant={source === "rtms" ? "blue" : source === "register" ? "teal" : "orange"}
      label={source === "register" ? "건축물대장" : badgeFor(source)} />
  );
}

function OfficialLink({ url, where }) {
  if (url) {
    return <a href={url} target="_blank" rel="noreferrer">{where}</a>;
  }
  return <Text type="supporting">{`${where} (공식 확인 필요)`}</Text>;
}

export function JeonseTab({ state }) {
  const doc = state.money;
  const labels = doc && doc.homes ? Object.keys(doc.homes) : [];
  const [home, setHome] = useState("A");
  const [path, setPath] = useState("insured");
  const [depDraft, setDepDraft] = useState("");
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error || labels.length === 0) {
    return (
      <Banner status="warning" title="전세 점검 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const checklist = doc.assumptions9b && doc.assumptions9b["jeonse-checklist"];
  const label = labels.includes(home) ? home : labels[0];
  const h = doc.homes[label];
  const check = h.jeonse_check;
  const reg = h.register_signals;
  const net = doc.household_monthly_net_won || 0;
  const jeonseSel = h.by_tenure && h.by_tenure["전세"];
  const spentDefault = jeonseSel ? net - jeonseSel.remaining_won : net;
  const depDefault = check && check.jeonse.median ? check.jeonse.median : 0;
  const deposit = depDraft === "" ? depDefault : Number(depDraft);
  let mock = null;
  try {
    mock = deposit > 0 ? mockDepositLoss({ depositWon: deposit,
      monthlyNetWon: net, monthlySpentWon: spentDefault,
      path, assumptions: MOCKLOSS_DEFAULTS }) : null;
  } catch {
    mock = null;
  }
  return (
    <VStack gap={2}>
      {checklist && checklist.context && (
        <Text type="supporting">
          {`${checklist.context.text} (${checklist.context.date} 보도, ${checklist.context.source} 인용${checklist.context.needs_confirmation ? ", 원문 확인 중" : ""})`}
        </Text>
      )}
      <SegmentedControl label="집" value={label} onChange={setHome} size="sm">
        {labels.map((l) => (
          <SegmentedControlItem key={l} value={l} label={`홈 ${l} · ${doc.homes[l].complex_name || ""}`} />
        ))}
      </SegmentedControl>
      <VStack gap={1}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>전세가율 신호</Heading>
          <SrcBadge source="rtms" />
        </HStack>
        {!check && <Text type="supporting">이 집의 실거래 기준가가 없습니다.</Text>}
        {check && !check.computable && (
          <Text>{check.note}</Text>
        )}
        {check && check.computable && (
          <MetadataList>
            <MetadataListItem label="전세가율">
              <Text hasTabularNumbers>{`${check.ratio_pct}% (${check.band.label})`}</Text>
            </MetadataListItem>
            <MetadataListItem label="근거">
              <Text type="supporting" hasTabularNumbers>
                {`전세 중간 ${fmtWon(check.jeonse.median)} (${check.jeonse.count}건) ÷ 매매 중간 ${fmtWon(check.trade.median)} (${check.trade.count}건), ${check.area_m2}㎡ ±${check.bucket_m2}㎡, ${check.period.from}~${check.period.to}`}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="참고선">
              <Text type="supporting">{`${check.ref_note} (${check.band.criterion_id})`}</Text>
            </MetadataListItem>
          </MetadataList>
        )}
        <Text type="supporting">이 탭은 안전/위험 판정을 하지 않는다. 신호와 빠진 정보만 보여준다.</Text>
      </VStack>
      <VStack gap={1}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>등기 신호 (보유 자료)</Heading>
          <SrcBadge source="register" />
        </HStack>
        {!reg && <Text type="supporting">등기 자료가 없습니다.</Text>}
        {reg && (
          <MetadataList>
            {reg.rows.map((r) => (
              <MetadataListItem key={r.field} label={r.field}>
                <Text type="supporting">{r.value !== null ? String(r.value) : r.note}</Text>
              </MetadataListItem>
            ))}
          </MetadataList>
        )}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>체크리스트 (공식 출처에서 확인)</Heading>
        {!checklist && <Text type="supporting">체크리스트 파일이 없습니다.</Text>}
        {checklist && checklist.items.map((it) => (
          <VStack gap={1} key={it.id}>
            <Text>{it.what}</Text>
            <Text type="supporting">{it.why}</Text>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">어디서:</Text>
              <OfficialLink url={it.url} where={it.where} />
            </HStack>
          </VStack>
        ))}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>모의 피해 시나리오 — 계약 만료에 보증금을 돌려받지 못하면</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <SegmentedControl label="모의 경로" value={path} onChange={setPath} size="sm">
            {Object.entries(MOCKLOSS_PATH_KO).map(([k, ko]) => (
              <SegmentedControlItem key={k} value={k} label={ko} />
            ))}
          </SegmentedControl>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">보증금(원)</Text>
            <input className="ui-weight" type="number" min="0" step="1000000"
              value={depDraft} placeholder={String(depDefault)}
              onChange={(e) => setDepDraft(e.target.value)} aria-label="모의 보증금" />
          </HStack>
        </HStack>
        {!mock && <Text type="supporting">보증금을 입력하면 모의 결과가 보인다.</Text>}
        {mock && (
          <MetadataList>
            <MetadataListItem label="모의 결과">
              <VStack gap={1}>
                <Text hasTabularNumbers>{`${mock.locked_note} ${fmtWon(mock.recovery_won)} 회수 · ${fmtWon(mock.short_won)} 부족`}</Text>
                <Text type="supporting">{mock.shortfall_note}</Text>
                <Text type="supporting">{`다음 이사: ${mock.next_move_note}`}</Text>
                <Text type="supporting">{`가정: ${mock.assumptions_used.recovery_months === null ? "회수 없음" : `${mock.assumptions_used.recovery_months}개월 뒤 ${mock.assumptions_used.recovery_pct}%`} (${mock.assumptions_used.source}, ${mock.criterion_id} — 상담에서 변경 가능)`}</Text>
              </VStack>
            </MetadataListItem>
          </MetadataList>
        )}
        <Text type="supporting">{MOCKLOSS_LEGAL_NOTE}</Text>
        {checklist && checklist.support_center && (
          <HStack gap={1} vAlign="center">
            <Text type="supporting">도움:</Text>
            <OfficialLink url={checklist.support_center.url} where={checklist.support_center.name} />
          </HStack>
        )}
      </VStack>
    </VStack>
  );
}
