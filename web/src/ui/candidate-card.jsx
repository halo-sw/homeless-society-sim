// Real-estate grade candidate card (13, Part 6; 19c row/full).
// Hierarchy studied from Korean and global listing services.
// Two variants: "row" (default, the chat list — name first, ~112 px)
// and "full" (the 19a side-panel detail — photo, name, price first).
// SSR-safe.
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TENURE_KO } from "../profile.js";
import { fmtWon } from "../money/format.js";
import { fmtMoney, currencyOf } from "../money/currency.js";
import { SAME_STATION_KO, displayNameFor, KIND_MISMATCH_KO } from "../homes.js";
import { simBadgeFor } from "../mapsim.js";
import { aerialCreditFor } from "../aerial/drape.js";
import { basemapApiBase, isUsLonLat } from "../basemap.js";
import { SceneThumb, MiniMap, AerialThumb } from "./preview.jsx";
import { LANG } from "../i18n/lang.js";
import { romanizeName } from "../i18n/romanize.js";

export function tenurePriceLine(candidate, tenure) {
  const t = (candidate.tenures || []).find((x) => x.tenure === tenure)
    || candidate.tenures?.[0] || null;
  if (!t || t.median_won === null || t.median_won === undefined) {
    return { price: "가격 미정", sub: "실거래 없음", deals: 0, fit: "unknown" };
  }
  // 26c: a USD row shows its dollar rent with the ZIP estimate source
  // ("월세 월 $4,261 · ZIP 94025 추정 (Zillow)"); no deal counts.
  if (currencyOf(candidate) === "USD" || currencyOf(t) === "USD") {
    const label = TENURE_KO[t.tenure] || t.tenure;
    const zip = candidate.price && candidate.price.zip;
    return { price: `${label} ${fmtMoney(t.median_won, "USD", { monthly: t.tenure === "wolse" })}`
        + (zip ? ` · ZIP ${zip} 추정 (Zillow)` : ""),
      sub: "", deals: 0, fit: t.budget_fit, thin: t.thin_deal || null,
      range: [t.min_won, t.max_won], usd: true };
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

// 26c: a work estimate (Meta HQ) reads "…까지 자전거 12분 · 걷기 37분
// · 추정 (속도 가정)" with the used mode first.
function usWorkLine(work) {
  const bike = Math.round(work.bike_minutes);
  const walk = Math.round(work.walk_minutes);
  const first = work.mode === "walk" ? `걷기 ${walk}분` : `자전거 ${bike}분`;
  const second = work.mode === "walk" ? `자전거 ${bike}분` : `걷기 ${walk}분`;
  return `${work.name}까지 ${first} · ${second} · 추정 (속도 가정)`;
}

export function commuteShortLine(candidate, destName) {
  const c = candidate.commute;
  if (!c) return { text: "출퇴근 정보를 확인 중이에요", source: "unknown" };
  if (c.work) return { text: usWorkLine(c.work), source: "estimate" };
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

// 19c: the chat-list commute line — rounded minutes, no decimals.
// 29a2: one shape, total minutes first, detail after. { text, estimate,
// source } so the row renders its source tag (추정/공식/내가 말한 값)
// the same way on every row.
export function commuteRowLine(candidate, destName) {
  const c = candidate.commute;
  if (!c) return { text: "출퇴근 정보를 확인 중이에요", estimate: false, source: "unknown" };
  if (c.work) return { text: usWorkLine(c.work), estimate: true, source: "estimate" };
  const walkKnown = !!(c.walk && c.walk.known);
  const rideKnown = !!(c.ride && c.ride.known
    && Number.isFinite(c.ride.minutes) && c.ride.minutes > 0);
  const src = c.ride && c.ride.source === "customer" ? "said"
    : c.ride && c.ride.derived && (c.ride.derived.methodsUsed || []).includes("estimate")
      && !(c.ride.derived.methodsUsed || []).includes("schedule") ? "estimate" : "official";
  const near = (m) => (m < 1 ? "1분 이내" : `${Math.round(m)}분`);
  void destName;
  if (rideKnown && walkKnown) {
    const total = Math.round(c.walk.minutes + c.ride.minutes);
    return { text: `총 ${total}분 · ${c.walk.station}역 걸어서 ${near(c.walk.minutes)} + 지하철 ${Math.round(c.ride.minutes)}분`,
      estimate: src === "estimate", source: src };
  }
  if (walkKnown) {
    return { text: `총 ${near(c.walk.minutes)} · ${c.walk.station}역 걸어서`,
      estimate: false, source: "official" };
  }
  return { text: "도보 미확인", estimate: false, source: "unknown" };
}

const SRC_KO = { official: "공식", estimate: "추정", said: "내가 말한 값", unknown: "미확인" };
const SRC_CLS = { official: "ui-src-official", estimate: "ui-src-estimate", said: "ui-src-said", unknown: "" };

// 29a1: home/complex names keep the Hangul original (the DOM
// translator skips it); English mode adds a romanized gloss beside it.
export function HomeName({ name, lang = LANG }) {
  const original = String(name ?? "");
  const gloss = lang === "en" && /[가-힣]/.test(original)
    ? romanizeName(original) : "";
  return (
    <span className="ui-home-name">
      <span data-no-i18n>{original}</span>
      {gloss && gloss !== original ? <span className="ui-name-gloss">{` (${gloss})`}</span> : null}
    </span>
  );
}

export function SourceDot({ source }) {
  if (!source || source === "unknown" || !SRC_KO[source]) return null;
  // 31d: the word is visible text, so no redundant title — the row
  // would otherwise count it twice.
  return (
    <span>
      <span className={`ui-srcdot ${SRC_CLS[source] || ""}`} aria-hidden="true" />
      <Text type="supporting">{SRC_KO[source]}</Text>
    </span>
  );
}

// 19c: facts without any ✓ glyph — the budget fit is plain wording.
// 29a2: with a budget for the shown tenure and a median row price, the
// budget fact names the difference (억/만 via fmtWon, no trailing 원);
// without a budget it falls back to the fit wording.
export function factsFor(candidate, price, budgetWon, tenure) {
  const first = candidate.tenures?.[0] || null;
  const center = first ? first.bucket_center_m2 : null;
  return [
    candidate.kind,
    // 26c: sizeless buckets (US ZIP rents) show no size fact.
    candidate.sizeLabel || (center !== null && center !== undefined ? `${center}㎡` : null),
    candidate.build_year ? `${candidate.build_year}년` : null,
    budgetFactFor(candidate, price, budgetWon, tenure),
  ].filter(Boolean);
}

function budgetFactFor(candidate, price, budgetWon, tenure) {
  const list = candidate.tenures || [];
  const entry = (tenure && list.find((t) => t.tenure === tenure)) || list[0] || null;
  const median = entry ? entry.median_won : null;
  if (Number.isFinite(budgetWon) && budgetWon > 0 && Number.isFinite(median)) {
    const diff = budgetWon - median;
    const usd = currencyOf(candidate) === "USD" || currencyOf(entry) === "USD";
    const fmt = (v) => (usd ? fmtMoney(v, "USD") : fmtWon(v).replace(/ 원$/, ""));
    if (diff > 0) return `예산보다 ${fmt(diff)} 적어요`;
    if (diff < 0) return `예산보다 ${fmt(-diff)} 많아요`;
  }
  const fit = price ? price.fit : null;
  return fit === "all" ? "예산 안" : fit === "partial" ? "예산 일부" : fit === "none" ? "예산 밖" : null;
}

// 26n: the thumbnail order is complex photo, live aerial crop, 3D,
// MiniMap. The aerial thumb is live only in the US (USGS, no relay)
// or when the tile relay answers; otherwise the 3D branch shows.
export function aerialLiveFor(candidate) {
  if (!candidate || !Number.isFinite(candidate.lon) || !Number.isFinite(candidate.lat)) {
    return false;
  }
  return isUsLonLat(candidate.lon, candidate.lat) || basemapApiBase() !== null;
}

// Area shapes for aerialCreditFor: the list's country (plus its bbox
// so lon/lat-only candidates still resolve), or one candidate.
export function areaForList(candidates) {
  const list = (candidates || []).filter((c) => c
    && Number.isFinite(c.lon) && Number.isFinite(c.lat));
  const first = (candidates || [])[0] || {};
  if (list.length === 0) return { country: first.country };
  const lons = list.map((c) => c.lon);
  const lats = list.map((c) => c.lat);
  return { country: first.country,
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
}

export function areaForCandidate(candidate) {
  if (!candidate) return {};
  if (Number.isFinite(candidate.lon) && Number.isFinite(candidate.lat)) {
    return { country: candidate.country,
      bbox: [candidate.lon, candidate.lat, candidate.lon, candidate.lat] };
  }
  return { country: candidate.country };
}

function RowThumb({ candidate, hero }) {
  if (hero) {
    return (
      <img src={hero.thumb_url} alt={hero.title || "단지 사진"} loading="lazy"
        title={`${hero.credit} · 원본 보기`} />
    );
  }
  const sceneBranch = candidate.scene ? (
    <SceneThumb boxId={candidate.scene}
      home={{ lon: candidate.lon, lat: candidate.lat }}
      fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
  ) : (
    <MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />
  );
  if (aerialLiveFor(candidate)) {
    return (
      <AerialThumb lon={candidate.lon} lat={candidate.lat} width={96} height={96}
        fallback={sceneBranch} name={candidate.name} />
    );
  }
  return sceneBranch;
}

// 19c: the supporting walk/ride breakdown for the full card.
function commuteDetailLine(candidate) {
  const c = candidate.commute;
  if (!c) return "";
  const near = (m) => (m < 1 ? "1분 이내" : `${Math.round(m)}분`);
  const parts = [];
  if (c.walk && c.walk.known) parts.push(`걷기 ${near(c.walk.minutes)}`);
  if (c.ride && c.ride.known && Number.isFinite(c.ride.minutes) && c.ride.minutes > 0) {
    parts.push(`지하철 ${Math.round(c.ride.minutes)}분`);
  }
  return parts.join(" · ");
}

export function rowClickHandler(onDetail, candidate) {
  return (e) => {
    if (e && e.target && e.target.closest && e.target.closest("button")) return;
    if (onDetail) onDetail(candidate);
  };
}

// 29a2: the pick button names its home for screen readers.
function pickAriaLabel(candidate) {
  const name = displayNameFor(candidate);
  if (LANG === "en") {
    const gloss = /[가-힣]/.test(name) ? romanizeName(name) : "";
    return `Pick ${gloss && gloss !== name ? gloss : name}`;
  }
  return `${name} 담기`;
}

// 29a2: the row source tag (추정/공식/내가 말한 값) renders on every
// row the same way; unknown sources show no tag.
// 31a: plain meta text with the coloured dot — never a pill.
function RowSourceTag({ row }) {
  if (!row || !row.source || row.source === "unknown" || !SRC_KO[row.source]) return null;
  return (
    <span className="ui-cand-est"><SourceDot source={row.source} /></span>
  );
}

export function CandidateCard({ candidate, tenure, destName, photos, index,
  onLive, onJeonse, onDetail, picked = false, variant = "row",
  pickLetter = null, highlighted = false, note = "", budgetWon = null }) {
  const [slide, setSlide] = useState(0);
  const price = tenurePriceLine(candidate, tenure);
  const row = commuteRowLine(candidate, destName);
  const facts = factsFor(candidate, price, budgetWon, tenure);
  const pickLabel = pickAriaLabel(candidate);
  // 26c: one ZIP rent, so the title names its source vintage.
  const rangeTitle = currencyOf(candidate) === "USD" ? usRangeTitle(candidate)
    : price.range ? `범위 ${fmtWon(price.range[0])} – ${fmtWon(price.range[1])}` : price.sub;
  // 18: the hero is the complex photo when one exists, else the
  // painted 3D thumbnail — never a station or street photo. Nearby
  // photos stay visible as a small labelled strip with their licences.
  const slots = (photos && photos.slots) || [];
  const hero = slots.find((s) => s.slot === "complex") || null;
  const rest = slots.filter((s) => s !== hero);
  if (variant === "full") return (
    <FullCard candidate={candidate} price={price} facts={facts} row={row}
      hero={hero} rest={rest} slide={slide} setSlide={setSlide}
      picked={picked} rangeTitle={rangeTitle} pickLabel={pickLabel}
      onLive={onLive} onJeonse={onJeonse} />
  );
  const disc = picked ? (pickLetter || String((index ?? 0) + 1)) : String((index ?? 0) + 1);
  const rowClick = rowClickHandler(onDetail, candidate);
  return (
    <article className={`ui-cand-row${picked ? " is-picked" : ""}${highlighted ? " is-hi" : ""}`}
      role="button" tabIndex={0}
      onClick={rowClick}
      onKeyDown={(e) => {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" && onDetail) onDetail(candidate);
      }}>
      <div className="ui-cand-thumb">
        <RowThumb candidate={candidate} hero={hero} />
      </div>
      <div className="ui-cand-row-main">
        <div className="ui-cand-row-top">
          <span className={`ui-cand-disc${picked ? " is-pick" : ""}`} aria-hidden="true">{disc}</span>
          <span className="ui-cand-row-name"><HomeName name={displayNameFor(candidate)} /></span>
          <Button size="sm" variant={picked ? "primary" : "secondary"}
            label={picked ? "담음 ✓" : "담기"}
            aria-label={pickLabel}
            onClick={() => onLive && onLive(candidate)} />
        </div>
        <div className="ui-cand-row-price ui-num" title={rangeTitle}>{price.price}</div>
        <div className="ui-cand-row-facts ui-num">{facts.join(" · ")}</div>
        <div className="ui-cand-row-commute ui-num">
          {row.text}{row.source && row.source !== "unknown" ? " " : null}<RowSourceTag row={row} />
        </div>
        {candidate.kind_mismatch && <Text type="supporting">{KIND_MISMATCH_KO}</Text>}
        {note && <Text type="supporting">{`살아 보기 불가 · ${note}`}</Text>}
      </div>
    </article>
  );
}

// 26c: the range title for one ZIP rent:
// "ZIP 94025 대표 월세 (Zillow ZORI, 2026-09)".
function usRangeTitle(candidate) {
  const p = (candidate && candidate.price) || {};
  const zip = p.zip ? `ZIP ${p.zip} ` : "";
  const src = p.source === "zillow_zori_zip" ? "Zillow ZORI" : (p.source || "Zillow");
  const month = p.month ? `, ${p.month}` : "";
  return `${zip}대표 월세 (${src}${month})`;
}

function FullCard({ candidate, price, facts, row, hero, rest,
  slide, setSlide, picked, rangeTitle, pickLabel, onLive, onJeonse }) {
  const shot = rest.length > 0 ? rest[slide % rest.length] : null;
  const hasCoords = Number.isFinite(candidate.lon) && Number.isFinite(candidate.lat);
  const showHero = !!(hero || candidate.scene || hasCoords);
  const sceneFallback = candidate.scene ? (
    <SceneThumb boxId={candidate.scene}
      home={{ lon: candidate.lon, lat: candidate.lat }}
      fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
  ) : (
    <MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />
  );
  const detail = commuteDetailLine(candidate);
  return (
    <article className="ui-cand ui-cand-full ui-card-enter">
      {showHero && (
        <div className="ui-cand-photo">
          {hero ? (
            <a href={hero.page_url} target="_blank" rel="noreferrer" title={`${hero.credit} · 원본 보기`}>
              <img src={hero.thumb_url} alt={hero.title || "단지 사진"} loading="lazy" />
            </a>
          ) : hasCoords ? (
            <AerialThumb lon={candidate.lon} lat={candidate.lat} width={320} height={180}
              fallback={sceneFallback} name={candidate.name} />
          ) : (
            <SceneThumb boxId={candidate.scene}
              home={{ lon: candidate.lon, lat: candidate.lat }}
              fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
          )}
          {hero && <span className="ui-cand-label">{hero.label}</span>}
        </div>
      )}
      <div className="ui-cand-body">
        <div>
          <div className="ui-cand-name"><HomeName name={displayNameFor(candidate)} /></div>
          {candidate.dong && <div className="ui-cand-place">{candidate.dong}</div>}
          {candidate.kind_mismatch && <Text type="supporting">{KIND_MISMATCH_KO}</Text>}
        </div>
        <div>
          <div className="ui-cand-price ui-num" title={rangeTitle}>{price.price}</div>
          <div className="ui-cand-facts ui-num">{price.sub}</div>
        </div>
        <div className="ui-cand-facts ui-num">{facts.join(" · ")}</div>
        <div>
          <div className="ui-commute ui-num">
            {row.text}{row.source && row.source !== "unknown" ? " " : null}<RowSourceTag row={row} />
          </div>
          {detail && <Text type="supporting">{detail}</Text>}
        </div>
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
        {!showHero && !shot && (
          <MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />
        )}
        <div className="ui-cand-actions">
          <Button size="sm" variant={picked ? "primary" : "secondary"}
            label={picked ? "담음 ✓" : "담기"}
            aria-label={pickLabel || "담기"}
            onClick={() => onLive && onLive(candidate)} />
          {currencyOf(candidate) !== "USD" && (
            <Button size="sm" variant="secondary" label="전세 점검" onClick={() => onJeonse && onJeonse(candidate)} />
          )}
        </div>
        <details className="ui-section">
          <summary className="ui-section-head">어떻게 계산했나요</summary>
          <div className="ui-section-body">
            <Text type="supporting">{candidate.commute_ko || "계산 근거를 불러오는 중이에요"}</Text>
          </div>
        </details>
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
