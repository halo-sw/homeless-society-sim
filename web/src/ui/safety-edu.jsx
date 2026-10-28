// 안전·교육 tab (React, Astryx): official counts and access, never a verdict.
//
// Safety: police occurrence counts by category with source, period, unit
// and geographic level, plus the caveats (recorded-where, 성남시
// city-level, no cross-level comparison). Education: OSM facilities by
// level with graph walk minutes from each home, counts within 10/15
// minutes, and the child's simulated school route. No scores, no
// rankings, no colour-coded danger, no school quality. Data comes from
// <scenario>-money.json — never computed from thin air here.
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { fmtMinutes, fmtDistance, fmtCount } from "../money/format.js";
import { EDU_LEVEL_KO } from "../education.js";

function SafetyHome({ label, safety }) {
  if (!safety || safety.missing) {
    return (
      <VStack gap={1}>
        <Heading level={4}>{`홈 ${label} · 치안`}</Heading>
        <Text type="supporting">{(safety && safety.missing) || "안전 통계가 없습니다."}</Text>
      </VStack>
    );
  }
  return (
    <VStack gap={1}>
      <Heading level={4}>{`홈 ${label} · 치안 (${safety.column})`}</Heading>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Badge variant="purple" label="경찰청" />
        <Text type="supporting">{`${safety.source} · ${safety.period} · 단위 ${safety.unit} · ${safety.geo_level_ko}`}</Text>
      </HStack>
      <MetadataList>
        <MetadataListItem label="전체 발생 건수">
          <Text hasTabularNumbers>{fmtCount(safety.total, "건")}</Text>
        </MetadataListItem>
        {(safety.groups || []).map((g) => (
          <MetadataListItem key={g.cat1} label={g.cat1}>
            <VStack gap={0}>
              <Text hasTabularNumbers>{fmtCount(g.count, "건")}</Text>
              {(g.mid || []).map((m) => (
                <Text key={m.cat2} type="supporting" hasTabularNumbers>
                  {`${m.cat2} ${fmtCount(m.count, "건")}`}
                </Text>
              ))}
            </VStack>
          </MetadataListItem>
        ))}
      </MetadataList>
      {safety.population_note && <Text type="supporting">{safety.population_note}</Text>}
      {(safety.caveats || []).map((c, i) => (
        <Text key={i} type="supporting">{c}</Text>
      ))}
    </VStack>
  );
}

const EDU_COUNT_KO = [
  ["school_elementary", "초등학교"], ["school_middle", "중학교"],
  ["school_high", "고등학교"], ["school_unknown", "기타·미분류 학교"],
  ["kindergarten", "유치원"], ["childcare", "어린이집·돌봄"],
  ["library", "도서관"], ["academy", "학원"],
];

const NEAREST_KO = { school: "학교", kindergarten: "유치원", childcare: "어린이집·돌봄", library: "도서관", academy: "학원" };

function EducationHome({ label, home }) {
  const edu = home.qol_education;
  const routes = home.school_routes || [];
  if (!edu) {
    return (
      <VStack gap={1}>
        <Heading level={4}>{`홈 ${label} · 교육`}</Heading>
        <Text type="supporting">교육 접근 데이터가 없습니다.</Text>
      </VStack>
    );
  }
  const bands = edu.bands || [10, 15];
  return (
    <VStack gap={1}>
      <Heading level={4}>{`홈 ${label} · 교육 (${home.complex_name})`}</Heading>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Badge variant="teal" label="그래프" />
        <Text type="supporting">{`도보 그래프 실측 · 성인 속도 ${edu.speed_mps} m/s · OSM 기준`}</Text>
      </HStack>
      <MetadataList>
        {bands.map((b) => {
          const counts = (edu.counts || {})[`within_${b}min`] || {};
          return (
            <MetadataListItem key={b} label={`${b}분 안`}>
              <Text type="supporting" hasTabularNumbers>
                {EDU_COUNT_KO.map(([k, ko]) => `${ko} ${counts[k] ?? 0}`).join(" · ")}
              </Text>
            </MetadataListItem>
          );
        })}
        {Object.entries(NEAREST_KO).map(([bucket, ko]) => {
          const near = ((edu.nearest || {})[bucket] || [])[0];
          return (
            <MetadataListItem key={bucket} label={`가장 가까운 ${ko}`}>
              <Text type="supporting" hasTabularNumbers>
                {near
                  ? `${near.name}${near.level ? ` (${EDU_LEVEL_KO[near.level] || near.level})` : ""} · ${fmtMinutes(near.minutes)} (${fmtDistance(near.distance_m)})`
                  : "도달 가능한 곳 없음"}
              </Text>
            </MetadataListItem>
          );
        })}
      </MetadataList>
      {routes.length > 0 && (
        <VStack gap={0}>
          <Text>아이 등교 경로 (시뮬레이션)</Text>
          {routes.map((r, i) => (
            <Text key={i} type="supporting" hasTabularNumbers>
              {r.minutes === undefined || r.minutes === null
                ? `${r.label || "자녀"}: ${r.note}`
                : `${r.label || "자녀"}: ${r.school} · ${fmtMinutes(r.minutes)} (${fmtDistance(r.distance_m)}) · primary 구간 ${r.primary_ways}곳 · ${r.speed_note}`}
            </Text>
          ))}
        </VStack>
      )}
      <Text type="supporting">{`학원 수: ${edu.academy_note}`}</Text>
      <Text type="supporting">{edu.no_quality_note}</Text>
    </VStack>
  );
}

export function SafetyEduTab({ state }) {
  const doc = state.money;
  if (state.moneyLoading) return <Text type="supporting">불러오는 중…</Text>;
  if (!doc || doc.error) {
    return (
      <Banner status="warning" title="안전·교육 데이터를 불러오지 못했습니다"
        description={(doc && doc.error) || "money.json이 없습니다"} />
    );
  }
  const labels = Object.keys(doc.homes || {});
  return (
    <VStack gap={2}>
      {labels.map((label) => (
        <SafetyHome key={`s-${label}`} label={label} safety={doc.homes[label].qol_safety} />
      ))}
      {labels.map((label) => (
        <EducationHome key={`e-${label}`} label={label} home={doc.homes[label]} />
      ))}
    </VStack>
  );
}
