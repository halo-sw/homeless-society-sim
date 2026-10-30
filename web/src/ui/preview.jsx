// Real-estate preview cards (12b, C): a candidate home as a photo
// strip (real Commons photos near the home — never the listing's own
// photos), our own 3D thumbnail, real-transaction medians, commute
// and plain-words cost. Every number keeps its source badge.
//
// previewSources: pluggable image sources. Commons + our 3D thumbnail
// are on today; roadview (Kakao Roadview JS SDK) and aerial (VWorld
// WMTS) slots render nothing unless a public browser key is
// configured (VITE_KAKAO_JS_KEY / VITE_VWORLD_KEY, domain-restricted,
// never committed). No listing-portal or social scraping anywhere —
// their terms forbid it.
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Carousel } from "@astryxdesign/core/Carousel";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { PHOTOS_DISCLAIMER, sceneThumbnail,
  createWebGLThumbnailRenderer } from "../places/photos.js";
import { assetUrl } from "../paths.js";
import { aerialThumbTiles, aerialThumbUrl, aerialThumbZoom } from "../aerial/thumb.js";
import { aerialCreditFor } from "../aerial/drape.js";
import { basemapApiBase } from "../basemap.js";
import { SOURCE_BADGES } from "../homes.js";
import { JEONSE_MIN_TRADES, JEONSE_REF_NOTE, JEONSE_SPARSE_NOTE,
  JEONSE_CAUTION_ID, JEONSE_WARNING_ID } from "../money/jeonse.js";
import { fmtWon, fmtMinutes } from "../money/format.js";
import { SourceBadge } from "./source-badge.jsx";
import { monthlyHousingLabel } from "./copy.js";
import { TENURE_KO } from "../profile.js";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const previewSources = {
  commons: { id: "commons", label: "주변 사진", enabled: true },
  thumbnail: { id: "thumbnail", label: "우리 3D 미리보기", enabled: true },
  roadview: { id: "roadview", label: "거리 뷰",
    enabled: Boolean(ENV.VITE_KAKAO_JS_KEY),
    needs: "VITE_KAKAO_JS_KEY (Kakao developers, domain-restricted JS key)" },
  aerial: { id: "aerial", label: "항공 사진",
    enabled: Boolean(ENV.VITE_VWORLD_KEY),
    needs: "VITE_VWORLD_KEY (VWorld, domain-restricted key)" },
};

export function previewSourceEnabled(id) {
  const s = previewSources[id];
  return !!s && s.enabled === true;
}

// Disabled slots render nothing (contract-tested). When a key is
// configured the slot mounts its SDK view:
// - roadview: Kakao Maps JS SDK Roadview (script tag with the JS key,
//   new kakao.maps.Roadview + RoadviewClient.getNearestPanoId).
// - aerial: VWorld WMTS ortho tile layer (GetMap, domain key).
export function RoadviewSlot() {
  if (!previewSourceEnabled("roadview")) return null;
  return null; // key set but the SDK mount is future work
}

export function AerialSlot() {
  if (!previewSourceEnabled("aerial")) return null;
  return null; // key set but the WMTS mount is future work
}

// --- photo strip ---------------------------------------------------------------

function PhotoSlide({ photo }) {
  const alt = photo.title || photo.credit || "주변 사진";
  return (
    <a className="ui-photo" href={photo.page_url} target="_blank" rel="noreferrer"
      title={`${photo.credit} · 원본 보기`}>
      <img src={photo.thumb_url} alt={alt} loading="lazy" />
      <Text type="supporting">{photo.credit}</Text>
    </a>
  );
}

export function PhotoStrip({ photos }) {
  const list = (photos || []).filter((p) => p && p.thumb_url);
  if (list.length === 0) return null;
  return (
    <div className="ui-photos">
      <Carousel gap={2} label="주변 사진">
        {list.map((p, i) => (
          <PhotoSlide key={`${p.page_url || i}-${i}`} photo={p} />
        ))}
      </Carousel>
      <div className="ui-photos-flag">
        <span className="ui-cand-label">{PHOTOS_DISCLAIMER}</span>
      </div>
    </div>
  );
}

// --- 3D thumbnail / mini map ----------------------------------------------------

function defaultThumbDeps(boxId) {
  return {
    loadArea: async (id) => {
      const area = await (await fetch(assetUrl(`/data/${id}/area.json`))).json();
      for (const [key, value] of Object.entries(area)) {
        if (value && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).join() === "$ref") {
          area[key] = await (await fetch(assetUrl(`/data/${id}/${value.$ref}`))).json();
        }
      }
      return area;
    },
    createRenderer: (w, h) => createWebGLThumbnailRenderer(w, h),
  };
}

export function SceneThumb({ boxId, deps = null, home = null, fallback = null }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  // 18d: the thumbnail frames the home's own building (home lon/lat);
  // when the scene has no building for it, the caller-provided
  // fallback (usually the MiniMap) shows instead of an empty frame.
  const homeKey = home && Number.isFinite(home.lon) && Number.isFinite(home.lat)
    ? `${home.lon},${home.lat}` : "";
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    sceneThumbnail(boxId, deps || defaultThumbDeps(boxId), home)
      .then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [boxId, homeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return fallback;
  if (!url) {
    return (
      <div className="ui-thumb-loading" role="img" aria-label="3D 미리보기 불러오는 중">
        <Text type="supporting">3D 미리보기 불러오는 중…</Text>
      </div>
    );
  }
  return (
    <figure className="ui-thumb">
      <img src={url} alt={`${boxId} 3D 미리보기 (우리 자료로 만든 모형)`} loading="lazy" />
      <figcaption>
        <Text type="supporting">우리 3D 미리보기 · 실제 모습이 아니에요</Text>
      </figcaption>
    </figure>
  );
}

// No scene: an honest handoff to the real map (OpenStreetMap) instead
// of a fake schematic — no invented cartography, no straight lines.
export function MiniMap({ lon, lat, name }) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=16/${lat.toFixed(5)}/${lon.toFixed(5)}`;
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Text type="supporting">3D 장면이 아직 없어요</Text>
      <a href={href} target="_blank" rel="noreferrer">
        <Text type="supporting">{`${name || "이 집"} 위치 OpenStreetMap에서 보기`}</Text>
      </a>
    </HStack>
  );
}

// --- live aerial thumbnail ----------------------------------------------------------
// 26n: every candidate shows the real place — a live aerial photo crop
// centred on the home, with a pin. Tiles come from the relay
// (/api/tiles/Satellite, key server-side) in Korea and from USGS
// directly in the US. The browser fetches the tiles; nothing is
// written anywhere. Any tile failure (or no relay on a static build)
// falls back to the caller's fallback.
export function AerialThumb({ lon, lat, width = 96, height = 96, fallback = null }) {
  const ref = useRef(null);
  const [measured, setMeasured] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setMeasured({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  const winW = Math.max(1, Math.round((measured && measured.w) || width || 96));
  const winH = Math.max(1, Math.round((measured && measured.h) || height || 96));
  const zoom = aerialThumbZoom(x, y);
  const layout = aerialThumbTiles({ lon: x, lat: y, z: zoom.z,
    widthPx: winW, heightPx: winH, tilePx: zoom.tilePx });
  const apiBase = basemapApiBase();
  const urls = layout.tiles.map((t) => aerialThumbUrl(apiBase, x, y, t));
  if (failed || urls.some((u) => u == null)) return fallback;
  const credit = aerialCreditFor({ bbox: [x, y, x, y] });
  return (
    <div ref={ref} title={credit}
      style={{ position: "relative", overflow: "hidden", width: "100%", height: "100%" }}>
      {layout.tiles.map((t, i) => (
        <img key={`${t.z}/${t.y}/${t.x}`} src={urls[i]} alt=""
          loading="lazy" decoding="async" draggable={false}
          onError={() => setFailed(true)}
          style={{ position: "absolute", left: t.left, top: t.top,
            width: layout.size, height: layout.size, maxWidth: "none" }} />
      ))}
      <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%",
        width: 10, height: 10, borderRadius: "50%", transform: "translate(-50%, -50%)",
        background: "rgba(17,20,26,0.9)", border: "2px solid #fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5), 0 0 0 1px #fff" }} />
      <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: "var(--ui-t12)",
        color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 4, padding: "0 4px" }}>
        항공사진
      </span>
    </div>
  );
}

// --- numbers ---------------------------------------------------------------------

function tenureEntry(candidate, tenureKey) {
  const list = candidate.tenures || [];
  return list.find((t) => t.tenure === tenureKey) || list[0] || null;
}

// 보증금이 집값의 몇 %인지 from bucket medians (same ±5㎡ bucket only):
// median 전세 ÷ median 매매. Same reference bands as the jeonse tab
// (70/80, 통상 언급되는 값 — 법적 기준 아님), sparse note when the
// sale history is too thin. Null when unavailable (never computed
// across different buckets).
export function bucketJeonseSignal(tenures) {
  const list = tenures || [];
  const jeonse = list.find((t) => t.tenure === "jeonse" && t.median_won > 0);
  const trade = list.find((t) => t.tenure === "trade" && t.median_won > 0);
  if (!jeonse || !trade) return null;
  if (jeonse.bucket_center_m2 !== trade.bucket_center_m2) return null;
  if ((trade.deals || 0) < JEONSE_MIN_TRADES || (jeonse.deals || 0) === 0) {
    return { computable: false, note: JEONSE_SPARSE_NOTE };
  }
  const ratio = Math.round((jeonse.median_won / trade.median_won) * 1000) / 10;
  const band = ratio >= 80
    ? { id: JEONSE_WARNING_ID, text: "80% 이상" }
    : ratio >= 70 ? { id: JEONSE_CAUTION_ID, text: "70% 이상" }
      : { id: null, text: "70% 미만" };
  return { computable: true, ratio_pct: ratio, band,
    jeonse_deals: jeonse.deals, trade_deals: trade.deals,
    note: JEONSE_REF_NOTE };
}

const FIT_KO = { all: "예산 안에 다 들어감", partial: "일부는 예산 초과", none: "예산 초과", unknown: "" };

function rideSourceBadges(ride) {
  if (!ride) return [];
  if (ride.source === "customer") return ["내가 말한 값"];
  if (ride.source === "derived" && ride.derived) {
    const methods = ride.derived.methodsUsed || [];
    const out = [];
    if (methods.includes("schedule")) out.push(SOURCE_BADGES.schedule);
    if (methods.includes("estimate")) out.push("추정");
    return out;
  }
  return [];
}

function fmtShortMin(v) {
  if (!Number.isFinite(v)) return "–";
  if (v < 1) return "1분 이내";
  if (v < 10) return `${Math.round(v * 10) / 10}분`;
  return fmtMinutes(v);
}

function CommuteLine({ candidate }) {
  const c = candidate.commute || {};
  const walk = c.walk || {};
  const ride = c.ride || {};
  return (
    <VStack gap={0}>
      <Text hasTabularNumbers>
        {walk.known
          ? `집에서 ${walk.station}까지 도보 ${fmtShortMin(walk.minutes)} (그래프)`
          : "도보 미확인"}
      </Text>
      {ride.lines && ride.lines.length > 0 && (
        <Text type="supporting">
          {`${ride.lines.join(" → ")}${(ride.transfers || []).length > 0 ? ` · 환승 ${(ride.transfers || []).length}회` : ""}`}
        </Text>
      )}
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text type="supporting" hasTabularNumbers>
          {ride.known ? `타는 시간 약 ${fmtShortMin(ride.minutes)}` : "타는 시간 미확인"}
        </Text>
        {rideSourceBadges(ride).length > 0 && (
          <Text type="supporting">{rideSourceBadges(ride).join(" · ")}</Text>
        )}
      </HStack>
      {ride.note && (
        <Text type="supporting">{ride.note}</Text>
      )}
    </VStack>
  );
}

// --- the card ---------------------------------------------------------------------

export function PreviewCard({ candidate, tenure, onPreview3D, onJeonse, onCompare, inCompare }) {
  const c = candidate;
  const entry = tenureEntry(c, tenure);
  const signal = bucketJeonseSignal(c.tenures);
  const tenureKo = TENURE_KO[tenure] || TENURE_KO[(entry && entry.tenure)] || "";
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <PhotoStrip photos={c.photos} />
        {c.scene ? (
          <SceneThumb boxId={c.scene} home={{ lon: c.lon, lat: c.lat }}
            fallback={<MiniMap lon={c.lon} lat={c.lat} name={c.name} />} />
        ) : <MiniMap lon={c.lon} lat={c.lat} name={c.name} />}
        <RoadviewSlot />
        <AerialSlot />
        <VStack gap={0}>
          <Heading level={4}>{c.name}</Heading>
          {c.kind && <Text type="supporting">{c.kind}</Text>}
          <Text type="supporting">
            {`${c.build_year ? `${c.build_year}년 지음 · ` : ""}`
              + `${entry ? `${entry.bucket_center_m2}㎡ (±5㎡)` : ""}`}
          </Text>
        </VStack>
        {entry && (
          <VStack gap={1}>
            <HStack gap={1} vAlign="center" wrap="wrap">
              <SourceBadge source="rtms" />
              <Text hasTabularNumbers>
                {`${TENURE_KO[entry.tenure] || entry.tenure} 중간 ${fmtWon(entry.median_won)}`
                  + ` (${fmtWon(entry.min_won)}–${fmtWon(entry.max_won)}, ${entry.deals}건)`}
              </Text>
            </HStack>
            {entry.tenure === "wolse" ? (
              <Text hasTabularNumbers>{`${monthlyHousingLabel("월세")}: ${fmtWon(entry.median_won)}`}</Text>
            ) : (
              <Text type="supporting">매달 드는 돈은 살아 보기 뒤 생활비 탭에서 계산해요</Text>
            )}
            {FIT_KO[entry.budget_fit] && (
              <Text type="supporting">{FIT_KO[entry.budget_fit]}</Text>
            )}
            <Text type="supporting">{SOURCE_BADGES.rtms}</Text>
          </VStack>
        )}
        <CommuteLine candidate={c} />
        {signal && (
          <Text type="supporting" hasTabularNumbers>
            {signal.computable
              ? `보증금이 집값의 ${signal.ratio_pct}% (${signal.band.text})`
              : "보증금이 집값의 몇 %인지 알 수 없어요"}
          </Text>
        )}
        {signal && !signal.computable && (
          <Text type="supporting">{signal.note}</Text>
        )}
        {c.match === "osm_name" && (
          <Text type="supporting">위치: OSM 단지 이름 일치</Text>
        )}
        {tenureKo && entry && (
          <Text type="supporting">{`${tenureKo} 기준으로 보여드려요`}</Text>
        )}
        <HStack gap={2} vAlign="center" wrap="wrap">
          {c.scene && (
            <Button size="sm" label="3D로 살아 보기" onClick={() => onPreview3D && onPreview3D(c)} />
          )}
          <Button size="sm" variant="secondary" label="전세 점검"
            onClick={() => onJeonse && onJeonse(c)} />
          <Button size="sm" variant={inCompare ? "secondary" : "ghost"}
            label={inCompare ? "비교에서 빼기" : "비교에 넣기"}
            onClick={() => onCompare && onCompare(c)} />
        </HStack>
      </VStack>
    </Card>
  );
}
