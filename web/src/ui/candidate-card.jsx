// Real-estate grade candidate card (13, Part 6; 19c row/full).
// Hierarchy studied from Korean and global listing services.
// Two variants: "row" (default, the chat list — name first, ~112 px)
// and "full" (the 19a side-panel detail — photo, name, price first).
// SSR-safe.
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
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
    return { price: "가격 미정", basis: "실거래 없음", sub: "실거래 없음",
      deals: 0, fit: "unknown" };
  }
  // 32b: price is the amount only (one line); the source basis rides
  // separately so the row can set it in small type below.
  // 26c: a USD amount is the dollar rent ("월세 월 $4,261"); no deal counts.
  if (currencyOf(candidate) === "USD" || currencyOf(t) === "USD") {
    const label = TENURE_KO[t.tenure] || t.tenure;
    const zip = candidate.price && candidate.price.zip;
    const basis = zip ? `ZIP ${zip} 추정 (Zillow)` : "";
    return { price: `${label} ${fmtMoney(t.median_won, "USD", { monthly: t.tenure === "wolse" })}`,
      basis, sub: basis, deals: 0, fit: t.budget_fit, thin: t.thin_deal || null,
      range: [t.min_won, t.max_won], usd: true };
  }
  const label = TENURE_KO[t.tenure] || t.tenure;
  const deals = t.deals || 0;
  const basis = `실거래 중간값 · ${deals}건`;
  if (t.tenure === "wolse" && t.deposit_median_won !== null) {
    return { price: `${label} ${fmtWon(t.deposit_median_won)}/${fmtWon(t.median_won)}`,
      basis, sub: basis, deals, fit: t.budget_fit, thin: t.thin_deal || null,
      range: [t.min_won, t.max_won] };
  }
  return { price: `${label} ${fmtWon(t.median_won)}`, basis, sub: basis, deals,
    fit: t.budget_fit, thin: t.thin_deal || null, range: [t.min_won, t.max_won] };
}

// 32b: the pre-split joined string — the result table and the pin card
// keep their text through this helper.
export function tenurePriceJoined(candidate, tenure) {
  const p = tenurePriceLine(candidate, tenure);
  return p.basis ? `${p.price} · ${p.basis}` : p.price;
}

// 32b: the short work line (used mode first) carries no workplace name
// and no estimate words — the name repeats the list title, and the one
// estimate marker is a Badge. The full sentence lives in the line's title.
function usWorkShort(work) {
  const bike = Math.round(work.bike_minutes);
  const walk = Math.round(work.walk_minutes);
  const first = work.mode === "walk" ? `걷기 ${walk}분` : `자전거 ${bike}분`;
  const second = work.mode === "walk" ? `자전거 ${bike}분` : `걷기 ${walk}분`;
  return `${first} · ${second}`;
}

function usWorkRow(work, workName) {
  const short = usWorkShort(work);
  const name = typeof work.name === "string" ? work.name : "";
  const known = typeof workName === "string" && workName !== ""
    && (name === workName || name.startsWith(workName));
  return {
    text: known || !name ? short : `${name}까지 ${short}`,
    estimate: true,
    source: "estimate",
    title: name ? `${name}까지 ${short} · 추정 (가정 속도)` : `${short} · 추정 (가정 속도)`,
  };
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
// 31f: the map pin card shows the same content as the candidate
// card — name, price and commute lines. Pure (no DOM) so it can be
// tested directly. picks holds picked candidate ids (max 2 from the
// pin card); an already-picked pin can always be removed.
export const PIN_CARD_MAX_PICKS = 2;
export function pinCardModel(pin, { tenure, picks } = {}) {
  const candidate = (pin && pin.candidate) || {};
  const ids = Array.isArray(picks) ? picks.map(String) : [];
  const picked = ids.includes(String(pin && pin.id));
  return {
    title: displayNameFor(candidate),
    price: tenurePriceJoined(candidate, tenure),
    commute: commuteRowLine(candidate).text,
    picked,
    canPick: picked || ids.length < PIN_CARD_MAX_PICKS,
  };
}

export function commuteRowLine(candidate, destName) {
  const c = candidate.commute;
  if (!c) return { text: "출퇴근 정보를 확인 중이에요", estimate: false, source: "unknown" };
  if (c.work) return usWorkRow(c.work, destName);
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

// 32c: the street-level photo slot — the nearest Mapillary photo
// facing the home, through our relay (/api/street, token server-side).
// The request carries the home's lon/lat only, never the viewer's.
// Memoised per candidate for the page session; at most 3 requests in
// flight. Null (without fetching) when there is no relay (static site
// without one), when the home has no coordinates, or on any failure.
const streetMemo = new Map();
let streetInflight = 0;
const streetWaiters = [];

function streetRelease() {
  streetInflight = Math.max(0, streetInflight - 1);
  const next = streetWaiters.shift();
  if (next) next();
}

async function fetchStreetPhoto(base, lon, lat) {
  await new Promise((resolve) => {
    if (streetInflight < 3) resolve();
    else streetWaiters.push(resolve);
  });
  streetInflight += 1;
  try {
    const res = await fetch(`${base}/api/street?lon=${lon}&lat=${lat}`);
    if (!res || !res.ok) return null;
    const json = await res.json();
    return (json && json.photo) || null;
  } catch {
    return null;
  } finally {
    streetRelease();
  }
}

export async function streetPhotoFor(candidate, { apiBase } = {}) {
  const lon = Number(candidate && candidate.lon);
  const lat = Number(candidate && candidate.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const base = apiBase === undefined ? basemapApiBase() : apiBase;
  if (base === null || base === undefined) return null;
  const id = candidate && candidate.id !== undefined && candidate.id !== null
    ? `id:${candidate.id}` : `${lon},${lat}`;
  const key = `${base}|${id}`;
  if (!streetMemo.has(key)) {
    streetMemo.set(key, fetchStreetPhoto(base, lon, lat));
  }
  return streetMemo.get(key);
}

// 32c: the Mapillary credits — the corner credit is short; the full
// line (licence + year) rides in the title and on the opened card.
export function streetShortCreditFor(photo) {
  if (!photo) return "";
  return `© ${photo.creator || "Mapillary contributor"} · Mapillary`;
}

export function streetFullCreditFor(photo) {
  if (!photo) return "";
  const who = photo.creator || "Mapillary contributor";
  const year = Number.isFinite(Number(photo.captured_year))
    ? ` · ${photo.captured_year}` : "";
  return `${who} · Mapillary · CC BY-SA 4.0${year}`;
}

// 32c: thumbnails report a resolved street photo upward through this
// small store, so the list note names only the kinds actually shown.
const listStreetIds = new Set();

export function reportListThumbKind(id, kind) {
  if (kind === "street" && id !== undefined && id !== null) {
    listStreetIds.add(String(id));
  }
}

// 32c: the thumbnail kinds actually shown across the list, in row
// order (hero → 3D → street → silhouette → minimap). Street comes
// from the store above; the rest is known synchronously.
const LIST_PHOTO_ORDER = ["hero", "scene", "street", "silhouette", "minimap"];

export function listThumbKinds(entries) {
  const kinds = [];
  for (const { candidate, photos } of (entries || [])) {
    const slots = (photos && photos.slots) || [];
    const kind = thumbKindFor(candidate, {
      hasHero: slots.some((s) => s && s.slot === "complex"),
      hasStreet: !!candidate && listStreetIds.has(String(candidate.id)),
      hasFootprint: !!(candidate && candidate.footprint),
    });
    if (!kinds.includes(kind)) kinds.push(kind);
  }
  return kinds.sort((a, b) => LIST_PHOTO_ORDER.indexOf(a) - LIST_PHOTO_ORDER.indexOf(b));
}

// 32c2: the Korean particle after the joined labels — 이에요 after a
// syllable with a final consonant, 예요 otherwise (non-Hangul → 예요).
export function listPhotoParticle(word) {
  const ch = String(word || "").slice(-1);
  const code = ch.codePointAt(0);
  if (code !== undefined && code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0 ? "이에요" : "예요";
  }
  return "예요";
}

// 32c2: a list area counts as US by country or by its bbox centre.
function listAreaIsUs(area) {
  if (area && area.country === "US") return true;
  const bbox = area && area.bbox;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const lon = (Number(bbox[0]) + Number(bbox[2])) / 2;
    const lat = (Number(bbox[1]) + Number(bbox[3])) / 2;
    if (Number.isFinite(lon) && Number.isFinite(lat) && isUsLonLat(lon, lat)) return true;
  }
  return false;
}

// 32c: the list note, built from the kinds actually shown — labels in
// row order, then the credits of those kinds. Never aerial: row
// thumbnails are never aerial since 32b.
// 32c2: built in both languages (the DOM translator never sees it —
// the Text showing it carries data-no-i18n).
export function listPhotoNote(kinds, area, lang = LANG) {
  const ko = lang !== "en";
  const labels = ko
    ? { hero: "단지 사진", scene: "우리 3D 모형", street: "거리 사진",
      silhouette: "건물 모양", minimap: "지도" }
    : { hero: "complex photo", scene: "our 3D model", street: "street photo",
      silhouette: "building shape", minimap: "map" };
  const seen = LIST_PHOTO_ORDER.filter((k) => (kinds || []).includes(k));
  if (seen.length === 0) {
    return ko ? "사진은 실제 매물 사진이 아니에요" : "Pictures are not actual listing photos";
  }
  const joined = seen.map((k) => labels[k]).join(ko ? "·" : " · ");
  const sentence = ko
    ? `사진은 ${joined}${listPhotoParticle(joined)}(실제 매물 사진 아님)`
    : `Pictures: ${joined} (not actual listing photos)`;
  const credits = [];
  const us = listAreaIsUs(area);
  if (seen.includes("scene") || seen.includes("silhouette")) {
    credits.push(ko
      ? (us ? "우리 자료로 만든 모형 (OSM)" : "우리 자료로 만든 모형 (GIS건물통합정보·OSM)")
      : (us ? "Model built from our data (OSM)"
        : "Model built from our data (GIS building data · OSM)"));
  }
  if (seen.includes("street")) {
    credits.push(ko ? "거리 사진: Mapillary (CC BY-SA 4.0)"
      : "Street photos: Mapillary (CC BY-SA 4.0)");
  }
  return credits.length > 0 ? `${sentence} · ${credits.join(" · ")}` : sentence;
}

// 32b: the row thumbnail order — complex photo, 3D miniature, street
// photo, building silhouette, MiniMap. No aerial photo in the row
// thumbnail any more (it stays an option on the opened card).
export function thumbKindFor(candidate, { hasHero = false, hasStreet = false, hasFootprint = false } = {}) {
  if (hasHero) return "hero";
  if (candidate && candidate.scene) return "scene";
  if (hasStreet) return "street";
  if (hasFootprint || (candidate && candidate.footprint)) return "silhouette";
  return "minimap";
}

// 32b: the credit for our own model views (3D miniature, silhouette).
export function modelCreditFor(candidate) {
  const us = (candidate && candidate.country === "US")
    || (candidate && Number.isFinite(candidate.lon) && Number.isFinite(candidate.lat)
      && isUsLonLat(candidate.lon, candidate.lat));
  return us ? "우리 자료로 만든 모형 (OSM)" : "우리 자료로 만든 모형 (GIS건물통합정보·OSM)";
}

// 32b: the nearest building footprint ring (lon/lat pairs) for the home —
// the same lookup the 3D thumb uses (the area's buildings for the home's
// lon/lat). Returns { ring, building } or null.
export function silhouetteFootprintFor(area, home) {
  const buildings = (area && area.buildings) || [];
  if (!home || !Number.isFinite(home.lon) || !Number.isFinite(home.lat)) return null;
  let best = null;
  let bestD = Infinity;
  for (const b of buildings) {
    const geom = b && b.geometry;
    if (!geom || !geom.coordinates) continue;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0] || [];
      if (ring.length < 4) continue;
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
      if (minLon === Infinity) continue;
      const d = Math.hypot((minLon + maxLon) / 2 - home.lon, (minLat + maxLat) / 2 - home.lat);
      if (d < bestD) { bestD = d; best = { ring, building: b }; }
    }
  }
  if (!best || bestD > 0.005) return null;
  return best;
}

function silhouettePoints(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minX) minX = lon;
    if (lat < minY) minY = lat;
    if (lon > maxX) maxX = lon;
    if (lat > maxY) maxY = lat;
  }
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const pad = 8;
  return ring.map(([lon, lat]) => `${(pad + ((lon - minX) / w) * (100 - pad * 2)).toFixed(2)},${(pad + ((maxY - lat) / h) * (100 - pad * 2)).toFixed(2)}`).join(" ");
}

// 32b: the building silhouette — the home's own footprint from above,
// north up, scaled to fit, with a floors/year label when known.
export function SilhouetteThumb({ footprint = null, floors = null, year = null,
  candidate = null, fallback = null }) {
  const ring = Array.isArray(footprint) ? footprint : null;
  if (!ring || ring.length < 3) return fallback;
  const bits = [Number.isFinite(floors) && floors > 0 ? `${Math.round(floors)}층` : null,
    Number.isFinite(year) && year > 0 ? `${Math.round(year)}년` : null].filter(Boolean);
  const credit = modelCreditFor(candidate);
  return (
    <figure className="ui-thumb ui-silhouette" title={credit}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`건물 모양 (${credit})`}>
        <polygon points={silhouettePoints(ring)}
          fill="var(--ds-ink-1)" fillOpacity={0.12}
          stroke="var(--ds-ink-1)" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      {bits.length > 0 && (
        <figcaption className="ui-silhouette-flag">
          <Text type="supporting">{bits.join(" · ")}</Text>
        </figcaption>
      )}
    </figure>
  );
}

// 32c: the street-level photo thumb. Takes an already-resolved photo
// when the caller picked the branch; otherwise asks streetPhotoFor
// itself — but only once the thumbnail is near the viewport
// (IntersectionObserver, SSR-safe: effects never run on the server).
// Shows a skeleton for at most 6 s, then falls through to the
// fallback (usually the silhouette). The corner credit names the
// Mapillary contributor, the full credit (licence + year) rides in
// the title, and the opened card shows that full line as a link.
const STREET_SKELETON_MS = 6000;

export function StreetThumb({ candidate = null, photo = null, fallback = null,
  showFullCredit = false }) {
  const [resolved, setResolved] = useState(photo || null);
  const [expired, setExpired] = useState(false);
  const slotRef = useRef(null);
  useEffect(() => {
    if (photo) {
      setResolved(photo);
      return undefined;
    }
    let live = true;
    let io = null;
    setResolved(null);
    setExpired(false);
    const timer = setTimeout(() => { if (live) setExpired(true); }, STREET_SKELETON_MS);
    const load = () => {
      streetPhotoFor(candidate).then((s) => {
        if (!live) return;
        if (s) {
          setResolved(s);
          reportListThumbKind(candidate && candidate.id, "street");
        }
      });
    };
    const el = slotRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      load();
    } else {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          io = null;
          load();
        }
      }, { rootMargin: "200px" });
      io.observe(el);
    }
    return () => {
      live = false;
      clearTimeout(timer);
      if (io) io.disconnect();
    };
  }, [candidate && candidate.id, photo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (photo) setResolved(photo);
  }, [photo]);
  if (resolved) {
    const src = resolved.thumb_url || resolved.url;
    if (!src) return fallback;
    const full = streetFullCreditFor(resolved);
    const page = resolved.page_url || null;
    return (
      <figure className="ui-thumb ui-street" title={full}>
        {page ? (
          <a href={page} target="_blank" rel="noreferrer" title={`${full} · 원본 보기`}>
            <img src={src} alt={`거리 사진 (${resolved.creator || "Mapillary"})`} loading="lazy" />
          </a>
        ) : (
          <img src={src} alt={`거리 사진 (${resolved.creator || "Mapillary"})`} loading="lazy" />
        )}
        <figcaption className="ui-street-credit">{streetShortCreditFor(resolved)}</figcaption>
        {showFullCredit && page && (
          <a href={page} target="_blank" rel="noreferrer" title={`${full} · 원본 보기`}>
            <Text type="supporting">{full}</Text>
          </a>
        )}
      </figure>
    );
  }
  if (expired) return fallback;
  return (
    <div ref={slotRef} className="ui-thumb-loading" role="img" aria-label="거리 사진 불러오는 중">
      <Text type="supporting">거리 사진 불러오는 중…</Text>
    </div>
  );
}

function RowThumb({ candidate, hero, street = null, footprint = null }) {
  if (hero) {
    return (
      <img src={hero.thumb_url} alt={hero.title || "단지 사진"} loading="lazy"
        title={`${hero.credit} · 원본 보기`} />
    );
  }
  const kind = thumbKindFor(candidate, { hasStreet: !!street,
    hasFootprint: !!(footprint || (candidate && candidate.footprint)) });
  if (kind === "scene") {
    return (
      <SceneThumb boxId={candidate.scene}
        home={{ lon: candidate.lon, lat: candidate.lat }}
        fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
    );
  }
  if (kind === "street") {
    return (
      <StreetThumb candidate={candidate} photo={street} />
    );
  }
  if (kind === "silhouette") {
    return (
      <SilhouetteThumb footprint={footprint || candidate.footprint}
        floors={candidate.floors ?? null} year={candidate.build_year}
        candidate={candidate}
        fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
    );
  }
  return (
    <MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />
  );
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

// 32b: an estimated commute carries exactly one marker — a neutral small
// 추정 badge (a plain span: the Badge component repeats its label in a
// title, which would count the word twice). Other sources keep the
// plain meta tag.
function RowEstimateTag({ row }) {
  if (!row) return null;
  if (row.estimate) {
    return (
      <span className="ui-cand-est"><span className="ui-est-badge">추정</span></span>
    );
  }
  return <RowSourceTag row={row} />;
}

export function CandidateCard({ candidate, tenure, destName, photos, index,
  onLive, onJeonse, onDetail, picked = false, variant = "row",
  pickLetter = null, highlighted = false, note = "", budgetWon = null }) {
  const [slide, setSlide] = useState(0);
  const [street, setStreet] = useState(null);
  const thumbRef = useRef(null);
  // 32c: the street request starts only when the row thumbnail is near
  // the viewport (SSR-safe: no IntersectionObserver on the server).
  useEffect(() => {
    let live = true;
    let io = null;
    const load = () => {
      streetPhotoFor(candidate).then((s) => {
        if (!live || !s) return;
        setStreet(s);
        reportListThumbKind(candidate && candidate.id, "street");
      });
    };
    const el = thumbRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      load();
    } else {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          io = null;
          load();
        }
      }, { rootMargin: "200px" });
      io.observe(el);
    }
    return () => {
      live = false;
      if (io) io.disconnect();
    };
  }, [candidate && candidate.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const price = tenurePriceLine(candidate, tenure);
  const row = commuteRowLine(candidate, destName);
  const facts = factsFor(candidate, price, budgetWon, tenure);
  // 32b: the row meta line — basis · kind · budget fit.
  const metaBits = [price.basis, candidate.kind,
    budgetFactFor(candidate, price, budgetWon, tenure)].filter(Boolean);
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
      street={street} picked={picked} rangeTitle={rangeTitle} pickLabel={pickLabel}
      onLive={onLive} onJeonse={onJeonse} />
  );
  const disc = picked ? (pickLetter || String((index ?? 0) + 1)) : String((index ?? 0) + 1);
  const rowClick = rowClickHandler(onDetail, candidate);
  const thumbKind = thumbKindFor(candidate, { hasHero: !!hero, hasStreet: !!street,
    hasFootprint: !!(candidate && candidate.footprint) });
  const thumbTitle = thumbKind === "scene" || thumbKind === "silhouette"
    ? modelCreditFor(candidate) : undefined;
  return (
    <article className={`ui-cand-row${picked ? " is-picked" : ""}${highlighted ? " is-hi" : ""}`}
      role="button" tabIndex={0}
      onClick={rowClick}
      onKeyDown={(e) => {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" && onDetail) onDetail(candidate);
      }}>
      <div className="ui-cand-thumb" title={thumbTitle} ref={thumbRef}>
        <RowThumb candidate={candidate} hero={hero} street={street} />
      </div>
      <div className="ui-cand-row-main">
        <div className="ui-cand-row-top">
          <span className={`ui-cand-disc${picked ? " is-pick" : ""}`} aria-hidden="true"{...(/^[AB]$/.test(disc) ? { "data-home": disc } : null)}>{disc}</span>
          <span className="ui-cand-row-name"><HomeName name={displayNameFor(candidate)} /></span>
          <Button size="sm" variant={picked ? "primary" : "secondary"}
            label={picked ? "담음 ✓" : "담기"}
            aria-label={pickLabel}
            onClick={() => onLive && onLive(candidate)} />
        </div>
        <div className="ui-cand-row-price ui-num" title={rangeTitle}>{price.price}</div>
        <div className="ui-cand-row-meta ui-num">{metaBits.join(" · ")}</div>
        <div className="ui-cand-row-commute ui-num" title={row.title}>
          {row.text}{row.estimate || (row.source && row.source !== "unknown") ? " " : null}<RowEstimateTag row={row} />
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
  slide, setSlide, street = null, picked, rangeTitle, pickLabel, onLive, onJeonse }) {
  const shot = rest.length > 0 ? rest[slide % rest.length] : null;
  const hasCoords = Number.isFinite(candidate.lon) && Number.isFinite(candidate.lat);
  const footprint = (candidate && candidate.footprint) || null;
  // 32b: the hero view switch — only the available views, aerial stays
  // as the last option. Default is the first available in row order.
  const views = [];
  if (candidate.scene) views.push({ value: "scene", label: "3D" });
  if (street) views.push({ value: "street", label: "거리 사진" });
  if (footprint) views.push({ value: "silhouette", label: "건물 모양" });
  if (hasCoords) views.push({ value: "aerial", label: "항공" });
  const [view, setView] = useState(null);
  const active = views.some((v) => v.value === view) ? view
    : (views[0] ? views[0].value : null);
  const showHero = !!(hero || views.length > 0);
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
          ) : null}
          {views.length > 0 && (
            <div className="ui-cand-view">
              {views.length > 1 && (
                <SegmentedControl label="미리보기 선택" value={active}
                  onChange={(v) => setView(v)} size="sm">
                  {views.map((v) => (
                    <SegmentedControlItem key={v.value} value={v.value} label={v.label} />
                  ))}
                </SegmentedControl>
              )}
              {active === "scene" && (
                <SceneThumb boxId={candidate.scene}
                  home={{ lon: candidate.lon, lat: candidate.lat }}
                  fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
              )}
              {active === "street" && (
                <StreetThumb candidate={candidate} photo={street} showFullCredit
                  fallback={footprint ? (
                    <SilhouetteThumb footprint={footprint}
                      floors={candidate.floors ?? null} year={candidate.build_year}
                      candidate={candidate}
                      fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
                  ) : sceneFallback} />
              )}
              {active === "silhouette" && (
                <SilhouetteThumb footprint={footprint}
                  floors={candidate.floors ?? null} year={candidate.build_year}
                  candidate={candidate}
                  fallback={<MiniMap lon={candidate.lon} lat={candidate.lat} name={candidate.name} />} />
              )}
              {active === "aerial" && (
                <AerialThumb lon={candidate.lon} lat={candidate.lat} width={320} height={180}
                  fallback={sceneFallback} name={candidate.name} />
              )}
            </div>
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
