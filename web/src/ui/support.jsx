// 지원 제도 한눈에 tab (React, Astryx). Same salary, what support
// exists: public-rental candidates (stage-6 recommend, precomputed without
// commute) plus policy-loan / youth / newly-wed condition comparisons.
// Row-by-row 대조 only — never "대상입니다".
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { fmtWon } from "../money/format.js";
import { ELIGIBILITY_NOTE } from "../money/housing.js";
import { Gloss } from "./gloss.jsx";
import { BURDEN_PLAIN_LABEL } from "./copy.js";
import { compareAllSupport, SUPPORT_NOTE, SUPPORT_NEEDS_OFFICIAL } from "../money/support.js";

// Engine results (충족/미충족/확인 필요) in the customer's words.
const RESULT_PLAIN = { "충족": "조건에 맞아요", "미충족": "조건에 안 맞아요", "확인 필요": "확인 필요" };

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
      <Text>{`${program.name} · ${program.org}`}</Text>
      <MetadataList>
        {program.rows.map((r) => (
          <MetadataListItem key={r.condition_id} label={r.condition}>
            <VStack gap={1}>
              <Text type="supporting" hasTabularNumbers>
                {`내가 쓴 값 ${r.customer} · 공고에 나온 값 ${r.published} → ${RESULT_PLAIN[r.result] || r.result}`}
              </Text>
              {r.note && <Text type="supporting">{r.note}</Text>}
            </VStack>
          </MetadataListItem>
        ))}
        <MetadataListItem label="이자율·빌릴 수 있는 돈">
          <Text type="supporting">{`${program.rate_range} · ${program.limit}`}</Text>
        </MetadataListItem>
      </MetadataList>
      <HStack gap={1} vAlign="center">
        <Text type="supporting">공고:</Text>
        {program.source_url
          ? <a href={program.source_url} target="_blank" rel="noreferrer">공식 페이지</a>
          : <Text type="supporting">{SUPPORT_NEEDS_OFFICIAL}</Text>}
        {program.as_of && <Text type="supporting">{`(${program.as_of} 공식 페이지 기준)`}</Text>}
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
        <Text>식구들 한 달 실수령 합계 {fmtWon(doc.household_monthly_net_won || 0, { monthly: true })}</Text>
        <Text type="supporting">(같은 월급으로 볼 수 있는 도움을 찾아요)</Text>
      </HStack>
      <VStack gap={1}>
        <Heading level={4}>내 조건 적기</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Field label="나이" value={age} onChange={setAge} />
          <Field label="1년에 버는 돈(원)" value={income} onChange={setIncome} step="1000000" />
          <Field label="가진 재산(원)" value={assets} onChange={setAssets} step="1000000" />
          <Field label="결혼한 지(년)" value={marriageYears} onChange={setMarriageYears} />
          <Field label="전세 보증금(원)" value={deposit} onChange={setDeposit} step="1000000" />
          <Field label="집값(원)" value={price} onChange={setPrice} step="1000000" />
          <YesNo label="지금 집이 있어요" value={ownsHome} onChange={setOwnsHome} />
          <YesNo label="2년 안에 아기 출산·입양" value={newborn} onChange={setNewborn} />
        </HStack>
        <Text type="supporting">적은 값은 이 화면에서 조건을 비교할 때만 써요. 보증금을 비워두면 홈 A 전세 한가운데 값으로 둬요.</Text>
      </VStack>
      <VStack gap={1}>
        <Heading level={4}><Gloss term="공공임대">공공임대</Gloss> 후보</Heading>
        {!rentals && (
          <Text type="supporting">후보 자료가 없어요. 상담에서 공공임대 후보를 물어보세요.</Text>
        )}
        {rentals && rentals.candidates.length === 0 && (
          <Text type="supporting">감당할 수 있는 선 안에서 면적이 맞는 후보가 없어요.</Text>
        )}
        {rentals && rentals.candidates.map((c) => (
          <VStack gap={1} key={`${c.complex_id}-${c.unit_type}`}>
            <Text>{`${c.address} ${c.exclusive_area_m2}㎡`}</Text>
            <Text type="supporting">
              {`보증금 ${fmtWon(c.deposit_won)} · 월 ${fmtWon(c.monthly_rent_won)}`}
              {c.burden_pct !== null ? ` · ${BURDEN_PLAIN_LABEL} ${c.burden_pct}%` : ""}
              {" · 출퇴근 시간은 상담에서 확인해요 (걸어서 직접 잰 시간)"}
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
        <Heading level={4}>빌릴 수 있는 돈·청년·신혼 도움 (조건을 한 줄씩 비교해요)</Heading>
        {!compared && <Text type="supporting">지원 제도 파일이 없어요.</Text>}
        {compared && compared.programs.map((p) => (
          <ProgramCard key={p.program_id} program={p} />
        ))}
        {compared && <Text type="supporting">{SUPPORT_NOTE}</Text>}
        <Text type="supporting">이 탭은 최종 결정을 내리지 않아요. 조건이 맞는지 공고 원문에서 직접 확인하세요.</Text>
      </VStack>
      <VStack gap={1}>
        <Text type="supporting">온통청년·복지로 공식 목록은 키가 오면 연결해요 (연결점 준비됨, 지금은 호출 없음).</Text>
      </VStack>
    </VStack>
  );
}
