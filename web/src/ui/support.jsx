// 지원 제도 한눈에 tab (React, Astryx). Same salary, what support
// exists: public-rental candidates (stage-6 recommend, precomputed without
// commute) plus policy-loan / youth / newly-wed condition comparisons.
// Row-by-row 대조 only — never "대상입니다".
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { fmtWon } from "../money/format.js";
import { ELIGIBILITY_NOTE } from "../money/housing.js";
import { compareAllSupport, SUPPORT_NOTE, SUPPORT_NEEDS_OFFICIAL } from "../money/support.js";

function numOrBlank(v) {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function Field({ label, value, onChange, min = "0", step = "1" }) {
  return (
    <HStack gap={1} vAlign="center">
      <Text type="supporting">{label}</Text>
      <input className="ui-weight" type="number" min={min} step={step}
        value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </HStack>
  );
}

function YesNo({ label, value, onChange }) {
  return (
    <HStack gap={1} vAlign="center">
      <Text type="supporting">{label}</Text>
      <SegmentedControl label={label} value={value} onChange={onChange} size="sm">
        <SegmentedControlItem value="blank" label="미입력" />
        <SegmentedControlItem value="yes" label="예" />
        <SegmentedControlItem value="no" label="아니요" />
      </SegmentedControl>
    </HStack>
  );
}

function ynTri(value) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

function ProgramCard({ program }) {
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>{`${program.name}`}</Text>
        <Badge variant="purple" label={program.org} />
      </HStack>
      <MetadataList>
        {program.rows.map((r) => (
          <MetadataListItem key={r.condition_id} label={r.condition}>
            <Text type="supporting" hasTabularNumbers>
              {`고객 ${r.customer} · 공고 ${r.published} → ${r.result}`}
            </Text>
          </MetadataListItem>
        ))}
        <MetadataListItem label="금리·한도">
          <Text type="supporting">{`${program.rate_range} · ${program.limit}`}</Text>
        </MetadataListItem>
      </MetadataList>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">공고:</Text>
        {program.source_url
          ? <a href={program.source_url} target="_blank" rel="noreferrer">공식 페이지</a>
          : <Text type="supporting">{SUPPORT_NEEDS_OFFICIAL}</Text>}
        {program.as_of && <Text type="supporting">{`(기준 ${program.as_of})`}</Text>}
      </HStack>
    </VStack>
  );
}

export function SupportTab({ state }) {
  const doc = state.money;
  const [age, setAge] = useState("");
  const [income, setIncome] = useState("");
  const [assets, setAssets] = useState("");
  const [marriageYears, setMarriageYears] = useState("");
  const [deposit, setDeposit] = useState("");
  const [price, setPrice] = useState("");
  const [ownsHome, setOwnsHome] = useState("blank");
  const [newborn, setNewborn] = useState("blank");
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="지원 제도 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const supportDoc = doc.assumptions9b && doc.assumptions9b["support-programs"];
  const profile = {
    age: numOrBlank(age),
    annual_income_won: numOrBlank(income),
    assets_won: numOrBlank(assets),
    marriage_years: numOrBlank(marriageYears),
    deposit_won: numOrBlank(deposit) ?? (doc.homes.A && doc.homes.A.jeonse_check
      && doc.homes.A.jeonse_check.jeonse.median) ?? undefined,
    price_won: numOrBlank(price),
    owns_home: ynTri(ownsHome),
    has_newborn: ynTri(newborn),
  };
  const compared = supportDoc ? compareAllSupport(supportDoc, profile) : null;
  const rentals = doc.support_rentals;
  return (
    <VStack gap={2}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text>가구 실수령 합계 {fmtWon(doc.household_monthly_net_won || 0, { monthly: true })}</Text>
        <Text type="supporting">(같은 월급에서 볼 수 있는 지원을 찾는다)</Text>
      </HStack>
      <VStack gap={1}>
        <Heading level={4}>내 조건 입력</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Field label="나이" value={age} onChange={setAge} />
          <Field label="연소득(원)" value={income} onChange={setIncome} step="1000000" />
          <Field label="자산(원)" value={assets} onChange={setAssets} step="1000000" />
          <Field label="혼인 기간(년)" value={marriageYears} onChange={setMarriageYears} />
          <Field label="보증금(원)" value={deposit} onChange={setDeposit} step="1000000" />
          <Field label="주택가격(원)" value={price} onChange={setPrice} step="1000000" />
          <YesNo label="유주택" value={ownsHome} onChange={setOwnsHome} />
          <YesNo label="신생아 출산·입양" value={newborn} onChange={setNewborn} />
        </HStack>
        <Text type="supporting">입력은 이 화면에서만 대조에 쓴다. 보증금은 비워두면 홈 A 전세 중간값으로 둔다.</Text>
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>공공임대 후보</Heading>
        {!rentals && (
          <Text type="supporting">후보 스냅샷이 없습니다. 상담에서 recommend_public_rental로 물어보세요.</Text>
        )}
        {rentals && rentals.candidates.length === 0 && (
          <Text type="supporting">부담선 안에서 면적이 맞는 후보가 없습니다.</Text>
        )}
        {rentals && rentals.candidates.map((c) => (
          <VStack gap={1} key={`${c.complex_id}-${c.unit_type}`}>
            <Text>{`${c.address} ${c.exclusive_area_m2}㎡`}</Text>
            <Text type="supporting">
              {`보증금 ${fmtWon(c.deposit_won)} · 월 ${fmtWon(c.monthly_rent_won)}`}
              {c.burden_pct !== null ? ` · 부담률 ${c.burden_pct}%` : ""}
              {" · 통근 시간은 상담에서 확인 (그래프)"}
            </Text>
            {(c.notices || []).slice(0, 2).map((n) => (
              <Text key={n.id} type="supporting">
                <a href={n.source_url} target="_blank" rel="noreferrer">{n.title || "공고 원문"}</a>
              </Text>
            ))}
          </VStack>
        ))}
        {rentals && <Text type="supporting">{ELIGIBILITY_NOTE}</Text>}
      </VStack>
      <VStack gap={1}>
        <Heading level={4}>정책 대출·청년·신혼 지원 (조건 대조)</Heading>
        {!compared && <Text type="supporting">지원 제도 파일이 없습니다.</Text>}
        {compared && compared.programs.map((p) => (
          <ProgramCard key={p.program_id} program={p} />
        ))}
        {compared && <Text type="supporting">{SUPPORT_NOTE}</Text>}
        <Text type="supporting">이 탭은 최종 판정을 하지 않는다. 조건이 맞는지 공고 원문에서 직접 확인한다.</Text>
      </VStack>
      <VStack gap={1}>
        <Text type="supporting">온통청년·복지로 공식 목록은 키가 오면 연결한다 (연결점 준비됨, 지금은 호출 없음).</Text>
      </VStack>
    </VStack>
  );
}
