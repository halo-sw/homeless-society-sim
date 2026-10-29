// 매물 tab (React, Astryx): two compliant paths to real listings.
//
// 1. "내가 본 매물 확인하기" — the customer pastes the listing text they
//    see in a real-estate app. Reading is instant and local (regex over
//    the pasted text, evidence shown); checking runs through the consult
//    agent (parse_listing → check_listing), which owns the RTMS lookups.
// 2. "공공 매물·공고" — LH/SH notices and youth-housing complexes from
//    the public-housing snapshot (money.mjs block), filtered by region,
//    recency, area and workplace distance, each linking the official
//    notice. Pins drop on the 3D map for entries with coordinates.
//
// The app never fetches or scrapes portal sites (their terms forbid it).
import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { store } from "./store.js";
import { SourceBadge } from "./source-badge.jsx";
import { parseListingText, plainListingFields,
  filterShapedListings } from "../money/listing.js";
import { fmtWon, fmtDistance } from "../money/format.js";

export const EXAMPLE_LISTING_TEXT = [
  "송파구 잠실동 레이크팰리스 101동 5층",
  "전세 9억 8000만, 전용 59.97㎡, 관리비 15만",
].join("\n");

const DEAL_FIELD_KO = {
  deal_type: "거래", price_won: "집값", deposit_won: "보증금",
  monthly_won: "한 달 월세", area_m2: "집 크기", floor: "층",
  complex_name: "단지 이름", address: "주소",
  maintenance_won_month: "관리비",
};

function fmtField(key, value) {
  if (value === null || value === undefined) return "–";
  if (key === "area_m2") return `${value}㎡`;
  if (key === "floor") return `${value}층`;
  if (typeof value === "number") return fmtWon(value);
  return String(value);
}

function initialText() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("fill") === "example") return EXAMPLE_LISTING_TEXT;
  } catch { /* non-browser render */ }
  return "";
}

export function PasteCheck({ onAsk } = {}) {
  const [text, setText] = useState(initialText);
  const [parsed, setParsed] = useState(null);
  const [filled, setFilled] = useState({});
  const check = store.getState().listingCheck || null;

  const read = () => {
    const r = parseListingText(text);
    setParsed(r.ok ? r : { ok: false, error: r.error, fields: null, missing: [] });
    setFilled({});
  };

  const merged = () => {
    const base = plainListingFields((parsed && parsed.fields) || {});
    const out = { ...base };
    for (const [k, v] of Object.entries(filled)) {
      if (v === "" || v === null || v === undefined) continue;
      out[k] = ["price_won", "deposit_won", "monthly_won", "area_m2",
        "floor", "maintenance_won_month"].includes(k) ? Number(v) : v;
    }
    delete out.area_note;
    return out;
  };

  const askCheck = () => {
    const text = `다음 매물을 check_listing으로 확인해줘: ${JSON.stringify(merged())}`;
    if (onAsk) {
      onAsk(text);
      return;
    }
    try {
      store.act("consultSend", text);
    } catch {
      /* consult not mounted (tour boot): the agent button still shows */
    }
  };

  const liveIn = () => {
    const m = merged();
    const text = `다음 매물을 add_listing_c로 C에 추가해줘: ${JSON.stringify({
      complex: check && check.complex ? check.complex : m.complex_name,
      area: check && check.area ? check.area : undefined,
      deal_type: m.deal_type, area_m2: m.area_m2,
      price_won: m.price_won, deposit_won: m.deposit_won,
      monthly_won: m.monthly_won,
      maintenance_won_month: m.maintenance_won_month, floor: m.floor,
    })}`;
    if (onAsk) {
      onAsk(text);
      return;
    }
    try {
      store.act("consultSend", text);
    } catch { /* same as above */ }
  };

  const missingFilled = parsed && parsed.missing
    && parsed.missing.every((m) => filled[m.field] !== undefined && filled[m.field] !== "");
  return (
    <VStack gap={2}>
      <Heading level={4}>내가 본 매물 확인하기</Heading>
      <Text type="supporting">민간 매물은 직접 붙여 넣어 주세요. 앱이 다른 사이트에서 가져오지 않아요.</Text>
      <textarea className="ui-listing-paste" rows={4} value={text}
        placeholder="예: 송파구 잠실동 레이크팰리스 101동 5층&#10;전세 9억 8000만, 전용 59.97㎡, 관리비 15만"
        onChange={(e) => setText(e.target.value)} aria-label="매물 글 붙여넣기" />
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button size="sm" label="읽어 보기" onClick={read} />
        <Button size="sm" variant="secondary" label="예시로 채우기 (예시)"
          onClick={() => { setText(EXAMPLE_LISTING_TEXT); setParsed(null); setFilled({}); }} />
        <Button size="sm" variant="ghost" label="지우기"
          onClick={() => { setText(""); setParsed(null); setFilled({}); }} />
      </HStack>
      {parsed && !parsed.ok && <Text>{parsed.error}</Text>}
      {parsed && parsed.ok && (
        <VStack gap={1}>
          <MetadataList>
            {Object.entries(DEAL_FIELD_KO).map(([key, label]) => {
              const f = parsed.fields[key];
              const value = f && typeof f === "object" ? f.value : null;
              if (value === null || value === undefined) return null;
              return (
                <MetadataListItem key={key} label={label}>
                  <VStack gap={1}>
                    <Text hasTabularNumbers>{fmtField(key, value)}</Text>
                    <Text type="supporting">{`글에서 찾음: “${f.evidence}”`}</Text>
                  </VStack>
                </MetadataListItem>
              );
            })}
          </MetadataList>
          {parsed.fields.area_note && (
            <Text type="supporting">{parsed.fields.area_note}</Text>
          )}
          {parsed.missing.length > 0 && (
            <VStack gap={1}>
              {parsed.missing.map((m) => (
                <HStack gap={1} vAlign="center" key={m.field}>
                  <Text type="supporting">{m.ask}</Text>
                  <input className="ui-weight" type={m.field === "complex_name" ? "text" : "number"}
                    value={filled[m.field] ?? ""}
                    onChange={(e) => setFilled({ ...filled, [m.field]: e.target.value })}
                    aria-label={m.ask} />
                </HStack>
              ))}
            </VStack>
          )}
          {parsed.missing.length === 0 && (
            <Text type="supporting">글에 있는 값만 읽었어요. 없는 값은 물어봐요.</Text>
          )}
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button size="sm" label="이 매물 확인하기" onClick={askCheck}
              isDisabled={parsed.missing.length > 0 && !missingFilled} />
          </HStack>
          <Text type="supporting">확인은 상담에서 해요 (개발 서버 + 키). 기록된 화면에서는 상담 패널을 여세요.</Text>
        </VStack>
      )}
      {check && <CheckResult check={check} onLiveIn={liveIn} />}
    </VStack>
  );
}

const POSITION_KO = { price: "집값", deposit: "보증금", monthly: "한 달 월세" };

function CheckResult({ check, onLiveIn }) {
  if (!check || check.computable === false) {
    return (
      <VStack gap={1}>
        <Heading level={4}>매물 확인 결과</Heading>
        <Text>{(check && check.note) || "확인 결과가 없어요."}</Text>
      </VStack>
    );
  }
  return (
    <VStack gap={2}>
      <Heading level={4}>매물 확인 결과</Heading>
      <HStack gap={1} vAlign="center" wrap="wrap">
        <SourceBadge source="rtms" />
        <Text type="supporting">{`${check.complex} · ${check.area_m2}㎡ (±5㎡) · ${check.match_method === "parcel+name" ? "땅+단지 이름" : "단지 이름"} ${check.parcel_rows + check.name_rows}건`}</Text>
      </HStack>
      <MetadataList>
        {Object.entries(check.positions || {}).map(([key, pos]) => (
          <MetadataListItem key={key} label={POSITION_KO[key] || "기타"}>
            {!pos.computable ? (
              <Text type="supporting">{pos.note}</Text>
            ) : (
              <VStack gap={1}>
                <Text hasTabularNumbers>{`${fmtWon(pos.asking_won)} · ${pos.band_text}`}</Text>
                <Text type="supporting" hasTabularNumbers>{pos.detail}</Text>
                <Text type="supporting" hasTabularNumbers>
                  {`한가운데 ${fmtWon(pos.median_won)} · 범위 ${fmtWon(pos.min_won)} ~ ${fmtWon(pos.max_won)} (${pos.n}건)`}
                </Text>
              </VStack>
            )}
          </MetadataListItem>
        ))}
        {check.ratio && check.ratio.computable && (
          <MetadataListItem label="보증금이 집값의 몇 %인지">
            <Text hasTabularNumbers>{`${check.ratio.ratio_pct}% (${check.ratio.band.label})`}</Text>
          </MetadataListItem>
        )}
        {check.register && (
          <MetadataListItem label="관청 자료에서 본 집 정보">
            <Text type="supporting">{`${check.register.building_count}개 동 · ${check.register.rows.length}개 항목 (자세히는 전세 점검 탭)`}</Text>
          </MetadataListItem>
        )}
      </MetadataList>
      <Text type="supporting">{check.note}</Text>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button size="sm" label="이 매물로 30일 살아 보기" onClick={onLiveIn} />
      </HStack>
    </VStack>
  );
}

const REGION_PRESETS = [
  { value: "", label: "전국" },
  { value: "송파구", label: "송파구" },
  { value: "성동구", label: "성동구" },
  { value: "분당구", label: "분당구" },
];

function PublicNotices({ doc }) {
  const [region, setRegion] = useState("");
  const [recentOnly, setRecentOnly] = useState(true);
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [nearWork, setNearWork] = useState(false);
  const pl = doc.public_listings;
  if (!pl) {
    return (
      <VStack gap={1}>
        <Heading level={4}>공공 매물·공고</Heading>
        <Text type="supporting">공공 매물 자료가 없어요. money.mjs를 다시 실행하세요.</Text>
      </VStack>
    );
  }
  const shaped = filterShapedListings(pl, {
    region, recent_only: recentOnly,
    min_area_m2: minArea === "" ? null : Number(minArea),
    max_area_m2: maxArea === "" ? null : Number(maxArea),
    near_work_max_m: nearWork ? 10000 : null,
    limit: 20,
  });
  const pin = (c) => {
    try {
      store.act("showListingPin", { lon: c.longitude, lat: c.latitude,
        label: `${c.name} (${c.address})` });
    } catch { /* scene not ready */ }
  };
  return (
    <VStack gap={2}>
      <Heading level={4}>공공 매물·공고</Heading>
      <Text type="supporting">{pl.attribution}</Text>
      <Text type="supporting">
        {`직장: ${(pl.workplace && pl.workplace.label) || "못 찾음"} · ${pl.workplace_note}`}
      </Text>
      <Text type="supporting">{pl.notes.join(" ")}</Text>
      {pl.notice_cap_note && <Text type="supporting">{pl.notice_cap_note}</Text>}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <SegmentedControl label="지역" value={region} onChange={setRegion} size="sm">
          {REGION_PRESETS.map((r) => (
            <SegmentedControlItem key={r.label} value={r.value} label={r.label} />
          ))}
        </SegmentedControl>
        <SegmentedControl label="올라온 때" value={recentOnly ? "recent" : "all"}
          onChange={(v) => setRecentOnly(v === "recent")} size="sm">
          <SegmentedControlItem value="recent" label="최근 공고만" />
          <SegmentedControlItem value="all" label="전부" />
        </SegmentedControl>
        <HStack gap={1} vAlign="center">
          <Text type="supporting">크기(㎡)</Text>
          <input className="ui-weight" type="number" min="0" placeholder="최소"
            value={minArea} onChange={(e) => setMinArea(e.target.value)} aria-label="최소 면적" />
          <Text type="supporting">~</Text>
          <input className="ui-weight" type="number" min="0" placeholder="최대"
            value={maxArea} onChange={(e) => setMaxArea(e.target.value)} aria-label="최대 면적" />
        </HStack>
        <SegmentedControl label="직장 거리" value={nearWork ? "near" : "all"}
          onChange={(v) => setNearWork(v === "near")} size="sm">
          <SegmentedControlItem value="near" label="직장 10km 안" />
          <SegmentedControlItem value="all" label="거리 무관" />
        </SegmentedControl>
        <Button size="sm" variant="ghost" label="핀 지우기"
          onClick={() => { try { store.act("clearListingPin"); } catch { /* noop */ } }} />
      </HStack>
      <VStack gap={1}>
        <Text>{`단지 ${shaped.complex_total}곳 (위치 있는 곳만 핀)`}</Text>
        {shaped.complexes.length === 0 && (
          <Text type="supporting">조건에 맞는 단지가 없어요.</Text>
        )}
        {shaped.complexes.map((c) => (
          <VStack gap={1} key={`${c.source}-${c.id}`}>
            <Text>{c.name}</Text>
            {(c.distance_to_work_m !== null || !c.has_prices) && (
              <Text type="supporting" hasTabularNumbers>
                {[c.distance_to_work_m !== null ? `직장 ${fmtDistance(c.distance_to_work_m)}` : "",
                  !c.has_prices ? "값은 공고 원문" : ""].filter(Boolean).join(" · ")}
              </Text>
            )}
            <Text type="supporting" hasTabularNumbers>
              {`${c.address}`}
              {c.area_min_m2 !== null ? ` · ${c.area_min_m2}${c.area_max_m2 !== c.area_min_m2 ? `~${c.area_max_m2}` : ""}㎡` : ""}
              {c.monthly_min_won !== null ? ` · 월 ${fmtWon(c.monthly_min_won)}부터` : ""}
              {c.deposit_min_won !== null ? ` · 보증금 ${fmtWon(c.deposit_min_won)}부터` : ""}
            </Text>
            {c.latitude !== null && c.longitude !== null && (
              <HStack gap={1} vAlign="center">
                <Button size="sm" variant="secondary" label="지도에 핀" onClick={() => pin(c)} />
              </HStack>
            )}
          </VStack>
        ))}
      </VStack>
      <VStack gap={1}>
        <Text>{`공고 ${shaped.notice_total}건 (새로 올라온 순서)`}</Text>
        {shaped.notices.length === 0 && (
          <Text type="supporting">조건에 맞는 공고가 없어요.</Text>
        )}
        {shaped.notices.map((n) => (
          <VStack gap={1} key={`${n.source}-${n.id}`}>
            {n.source_url ? (
              <a href={n.source_url} target="_blank" rel="noreferrer">{n.title}</a>
            ) : (
              <Text>{n.title}</Text>
            )}
            <Text type="supporting">{`${n.announced_day || n.announced_at}${n.recent ? " · 최근" : ""}${n.address ? ` · ${n.address}` : ""}`}</Text>
          </VStack>
        ))}
      </VStack>
    </VStack>
  );
}

export function ListingsTab({ state, sub = "" }) {
  const doc = state.money;
  useEffect(() => {
    try {
      if (sub === "public"
        || new URLSearchParams(window.location.search).get("sub") === "public") {
        document.getElementById("public-listings")?.scrollIntoView({ block: "start" });
      }
    } catch { /* non-browser render */ }
  }, [sub]);
  if (!doc || doc.error) return <Text type="supporting">생활비 문서를 먼저 만드세요.</Text>;
  return (
    <VStack gap={3}>
      <PasteCheck />
      <div id="public-listings">
        <PublicNotices doc={doc} />
      </div>
    </VStack>
  );
}
