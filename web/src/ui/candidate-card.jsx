// Real-estate grade candidate card (13, Part 6). Hierarchy studied
// from Korean and global listing services: photo, price, facts,
// place, then OUR decisive extra — the commute and the 30-day life.
// SSR-safe.
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TENURE_KO } from "../profile.js";
import { fmtWon } from "../money/format.js";
import { SAME_STATION_KO } from "../homes.js";
import { simBadgeFor } from "../mapsim.js";
import { SceneThumb, MiniMap } from "./preview.jsx";

export function tenurePriceLine(candidate, tenure) {
  const t = (candidate.tenures || []).find((x) => x.tenure === tenure)
    || candidate.tenures?.[0] || null;
  if (!t || t.median_won === null || t.median_won === undefined) {
    return { price: "가격 미정", sub: "실거래 없음", deals: 0, fit: "unknown" };
  }
  const label = TENURE_KO[t.tenure] || t.tenure;
  const deals = t.deals || 0;
  const sub = `실거래 중간값 · ${deals}건`;
  if (t.tenure === "wolse" && t.deposit_median_won !== null) {
    return { price: `${label} ${fmtWon(t.deposit_median_won)}/${fmtWon(t.median_won)}`,
      sub, deals, fit: t.budget_fit, thin: t.thin_deal || null,
      range: [t.min_won, t.max_won] };
  }
  return { price: `${label} ${fmtWon(t.median_won)}`, sub, deals,
    fit: t.budget_fit, thin: t.thin_deal || null, range: [t.min_won, t.max_won] };
}

export function commuteShortLine(candidate, destName) {
  const c = candidate.commute;
  if (!c) return { text: "출퇴근 정보를 확인 중이에요", source: "unknown" };
  if (candidate.commute_ko && candidate.commute_ko.includes(SAME_STATION_KO)) {
    return { text: SAME_STATION_KO, source: "official" };
  }
  const walkBit = c.walk && c.walk.known
    ? `걷기 ${c.walk.minutes < 1 ? "1분 이내" : `${c.walk.minutes}분`}` : "도보 미확인";
  if (c.ride && c.ride.known && Number.isFinite(c.ride.minutes) && c.ride.minutes > 0) {
    const total = Math.round(((c.walk.known ? c.walk.minutes : 0) + c.ride.minutes) * 10) / 10;
    const src = c.ride.source === "customer" ? "said"
      : c.ride.derived && (c.ride.derived.methodsUsed || []).includes("estimate")
        && !(c.ride.derived.methodsUsed || []).includes("schedule") ? "estimate" : "official";
    const where = destName ? `${destName}까지 ` : "";
    // 18d: the pre-run estimate keeps its own label — never the 30-day
    // 살아 보기 편도 (oneWayCommuteOfRun) shown after the run.
    return { text: `${where}약 ${total}분 (${walkBit} · 지하철 ${c.ride.minutes}분) · 추정 (살아 보기 전)`, source: src };
  }
  if (c.walk && c.walk.known) {
    return { text: `${c.walk.station} 도보 ${c.walk.minutes < 1 ? "1분 이내" : `${c.walk.minutes}분`} · 승차 미확인`, source: "official" };
  }
  return { text: "도보 미확인", source: "unknown" };
}

const SRC_KO = { official: "공식", estimate: "추정", said: "내가 말한 값", unknown: "미확인" };
const SRC_CLS = { official: "ui-src-official", estimate: "ui-src-estimate", said: "ui-src-said", unknown: "" };

export function SourceDot({ source }) {
  if (!source || source === "unknown" || !SRC_KO[source]) return null;
  return (
    <span title={SRC_KO[source]}>
      <span className={`ui-srcdot ${SRC_CLS[source] || ""}`} aria-hidden="true" />
      <Text type="supporting">{SRC_KO[source]}</Text>
    </span>
  );
}

export function CandidateCard({ candidate, tenure, destName, photos, index,
  onLive, onJeonse, onDetail, picked = false }) {
  const [slide, setSlide] = useState(0);
  const [openHow, setOpenHow] = useState(false);
  const price = tenurePriceLine(candidate, tenure);
  const commute = commuteShortLine(candidate, destName);
  const slots = (photos && photos.slots) || [];
  const facts = [
    candidate.kind,
    candidate.sizeLabel || (candidate.tenures?.[0] ? `${candidate.tenures[0].bucket_center_m2}㎡` : null),
    candidate.build_year ? `${candidate.build_year}년` : null,
    price.fit === "all" ? "예산 안 ✓" : price.fit === "partial" ? "예산 일부 ✓" : price.fit === "none" ? "예산 밖" : null,
  ].filter(Boolean);
  const badges = [simBadgeFor(candidate)];
  if (price.thin) badges.push(price.thin);
  else if (price.deals > 0) badges.push(`실거래 ${price.deals}건`);
  if (candidate.match === "osm_name") badges.push("OSM 위치");
  // 18: the hero is the complex photo when one exists, else the
  // painted 3D thumbnail — never a station or street photo. Nearby
  // photos stay visible as a small labelled strip with their licences.
  // No empty grey box: without a hero the area is omitted entirely.
  const hero = slots.find((s) => s.slot === "complex") || null;
  const rest = slots.filter((s) => s !== hero);
  const shot = rest.length > 0 ? rest[slide % rest.length] : null;
  const showHero = !!(hero || candidate.scene);
  return (
    <article className="ui-cand ui-card-enter"
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined}>
      {showHero && (
        <div className="ui-cand-photo">
          {hero ? (
            <a href={hero.page_url} target="_blank" rel="noreferrer" title={`${hero.credit} · 원본 보기`}>
              <img src={hero.thumb_url} alt={hero.title || "단지 사진"} loading="lazy" />
            </a>
          ) : (
            <SceneThumb boxId={candidate.scene} />
          )}
          {hero && <span className="ui-cand-label">{hero.label}</span>}
        </div>
      )}
      {shot && (
        <div className="ui-cand-strip">
          <a href={shot.page_url} target="_blank" rel="noreferrer" title={`${shot.credit} · 원본 보기`}>
            <img src={shot.thumb_url} alt={shot.title || "주변 사진"} loading="lazy" />
          </a>
          <div className="ui-cand-strip-meta">
            <Text type="supporting">{shot.label}</Text>
            <Text type="supporting">{shot.credit}</Text>
          </div>
          {rest.length > 1 && (
            <span style={{ display: "flex", gap: 4 }}>
              <Button size="sm" variant="secondary" label="‹"
                onClick={() => setSlide((slide + rest.length - 1) % rest.length)} />
              <Button size="sm" variant="secondary" label="›"
                onClick={() => setSlide((slide + 1) % rest.length)} />
              <Text type="supporting">{`${(slide % rest.length) + 1}/${rest.length}`}</Text>
            </span>
          )}
        </div>
      )}
      <div className="ui-cand-body">
        <div className="ui-cand-price ui-num" title={price.range ? `범위 ${fmtWon(price.range[0])} – ${fmtWon(price.range[1])}` : price.sub}>
          {price.price} <small>{price.sub}</small>
        </div>
        <div className="ui-cand-facts ui-num">{facts.join(" · ")}</div>
        <div>
          <div className="ui-cand-name">{candidate.name}</div>
          <div className="ui-cand-place">
            {[candidate.dong, candidate.commute?.walk?.known
              ? `${candidate.commute.walk.station} 도보 ${candidate.commute.walk.minutes < 1 ? "1분 이내" : `${candidate.commute.walk.minutes}분`}`
              : "도보 미확인"].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="ui-commute ui-num">
          {commute.text} <SourceDot source={commute.source} />
        </div>
        <div className="ui-cand-facts ui-num">{badges.join(" · ")}</div>
        {hero && <div className="ui-cand-credit">{hero.credit}</div>}
        {!showHero && !shot && (
          <MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />
        )}
        <div className="ui-cand-actions">
          <Button size="sm" variant={picked ? "secondary" : "primary"}
            label={picked ? "담김 ✓ · 빼기" : "비교에 담기"}
            onClick={() => onLive && onLive(candidate)} />
          <Button size="sm" variant="ghost" label="전세 점검" onClick={() => onJeonse && onJeonse(candidate)} />
          <Button size="sm" variant="ghost" label="자세히" onClick={() => onDetail && onDetail(candidate)} />
        </div>
        <div>
          <Button size="sm" variant="ghost" label={openHow ? "어떻게 계산했나요 ▲" : "어떻게 계산했나요 ▽"}
            onClick={() => setOpenHow(!openHow)} />
          {openHow && (
            <Text type="supporting">{candidate.commute_ko || "계산 근거를 불러오는 중이에요"}</Text>
          )}
        </div>
      </div>
    </article>
  );
}

export function CandidateSkeleton() {
  return (
    <div className="ui-cand" aria-hidden="true">
      <div className="ui-cand-photo"><div className="ui-skel" style={{ width: "100%", height: "100%" }} /></div>
      <div className="ui-cand-body">
        <div className="ui-skel" style={{ height: 26, width: "60%" }} />
        <div className="ui-skel" style={{ height: 14, width: "90%" }} />
        <div className="ui-skel" style={{ height: 14, width: "70%" }} />
      </div>
    </div>
  );
}
