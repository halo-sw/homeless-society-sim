// 전세 안전 점검 tab (React, Astryx). Public-data signals (전세가율,
// register fields), the official checklist, and clearly labelled 모의
// loss scenarios. Never "이 집은 안전/위험" — signals, missing
// information, and the checklist only.
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { Gloss } from "./gloss.jsx";
import { SourceBadge } from "./source-badge.jsx";
import { fmtWon } from "../money/format.js";
import { MOCKLOSS_PATH_KO, MOCKLOSS_LEGAL_NOTE, mockDepositLoss } from "../money/mockloss.js";

const MOCKLOSS_DEFAULTS = {
  insured_months: 2, insured_pct: 100,
  auction_months: 12, auction_pct: 70, unrecovered_pct: 0,
};

function SrcBadge({ source }) {
  return <SourceBadge source={source} />;
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
          <Heading level={4}>보증금이 집값의 몇 %인지 <Gloss term="전세가율" /></Heading>
          <SrcBadge source="rtms" />
        </HStack>
        {!check && <Text type="supporting">이 집은 실제로 거래된 값이 없어요.</Text>}
        {check && !check.computable && (
          <Text>{check.note}</Text>
        )}
        {check && check.computable && (
          <MetadataList>
            <MetadataListItem label="보증금이 집값의 몇 %인지">
              <Text hasTabularNumbers>{`${check.ratio_pct}% (${check.band.label})`}</Text>
            </MetadataListItem>
            <MetadataListItem label="무슨 값으로 계산했는지">
              <Text type="supporting" hasTabularNumbers>
                {`전세 한가운데 ${fmtWon(check.jeonse.median)} (${check.jeonse.count}건) ÷ 매매 한가운데 ${fmtWon(check.trade.median)} (${check.trade.count}건), ${check.area_m2}㎡ ±${check.bucket_m2}㎡, ${check.period.from}~${check.period.to}`}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="자주 쓰는 기준선">
              <Text type="supporting">{`${check.ref_note} (${check.band.criterion_id})`}</Text>
            </MetadataListItem>
          </MetadataList>
        )}
        <Text type="supporting">이 탭은 안전하다/위험하다고 판정하지 않아요. 신호와 빠진 정보만 보여줘요.</Text>
      </VStack>
      <VStack gap={1}>
        <HStack gap={1} vAlign="center">
          <Heading level={4}>관청 자료에서 본 집 정보</Heading>
          <SrcBadge source="register" />
        </HStack>
        {!reg && <Text type="supporting">관청 자료가 없어요.</Text>}
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
        <Heading level={4}>꼭 확인할 것 (공식 사이트에서 직접 확인해요)</Heading>
        {!checklist && <Text type="supporting">확인 목록 파일이 없어요.</Text>}
        {checklist && checklist.items.map((it) => (
          <VStack gap={1} key={it.id}>
            <Text>{it.what}</Text>
            <Text type="supporting">{it.why}</Text>
            <HStack gap={1} vAlign="center">
              <Text type="supporting">어디서 확인해요:</Text>
              <OfficialLink url={it.url} where={it.where} />
            </HStack>
          </VStack>
        ))}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>만약에 — 계약이 끝나도 보증금을 못 돌려받으면 (모의로 보는 흐름)</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <SegmentedControl label="만약에 보는 흐름" value={path} onChange={setPath} size="sm">
            {Object.entries(MOCKLOSS_PATH_KO).map(([k, ko]) => (
              <SegmentedControlItem key={k} value={k} label={ko} />
            ))}
          </SegmentedControl>
          <HStack gap={1} vAlign="center">
            <Text type="supporting">보증금(원)</Text>
            <input className="ui-weight" type="number" min="0" step="1000000"
              value={depDraft} placeholder={String(depDefault)}
              onChange={(e) => setDepDraft(e.target.value)} aria-label="만약에 보는 보증금" />
          </HStack>
        </HStack>
        {!mock && <Text type="supporting">보증금을 적으면 만약에 본 결과가 보여요.</Text>}
        {mock && (
          <MetadataList>
            <MetadataListItem label="만약에 본 결과">
              <VStack gap={1}>
                <Text hasTabularNumbers>{`${mock.locked_note} ${fmtWon(mock.recovery_won)} 돌려받고 · ${fmtWon(mock.short_won)} 못 받음`}</Text>
                <Text type="supporting">{mock.shortfall_note}</Text>
                <Text type="supporting">{`다음 이사: ${mock.next_move_note}`}</Text>
                <Text type="supporting">{`가정한 것: ${mock.assumptions_used.recovery_months === null ? "돌려받지 못함" : `${mock.assumptions_used.recovery_months}개월 뒤 ${mock.assumptions_used.recovery_pct}%`} (${mock.assumptions_used.source}, ${mock.criterion_id} — 상담에서 바꿀 수 있어요)`}</Text>
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
