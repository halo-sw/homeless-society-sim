// Chat stage map (25a): a real map — a light VWorld raster basemap
// under the vector layers when the tile proxy is available, subway
// lines with nearby stations, commute legs for picked homes, region
// names (text only), a dark workplace pill and one price pill per
// candidate (letters for picks). It zooms (wheel, double-click,
// buttons) and pans (drag); pill and label sizes stay constant in px.
// Hovering a card highlights its pin (cardHi) and hovering a pin
// highlights its card back; clicking a pin scrolls to its card;
// clicking a region still filters. SSR renders the container only.
import { useEffect, useRef, useState } from "react";
import { fitMapView, fitInsetFromChrome, layoutMapPills, layoutStationLabels, pickDongLabels,
  stationNameWidthPx, haversineKm,
  tagSizePx, tagLines, tagFontPx, clusterSizePx,
  MAP_COLORS, MAP_FIT_MARGIN, BASEMAP_MUTE } from "../chatmap.js";
import { basemapApiBase, basemapTileUrl, basemapTiles, basemapUnderlayTiles, basemapProvider,
  viewTransform, zoomAt } from "../basemap.js";
import { currentLang } from "../i18n/lang.js";
import { romanizeName } from "../i18n/romanize.js";
import { displayNameFor } from "../homes.js";
import { pinCardModel } from "./candidate-card.jsx";
import { toast } from "./toast.jsx";
import { locateResult } from "./map-filters.js";

function ptsAttr(pts, toXYz) {
  return pts.map(([lon, lat]) => {
    const [x, y] = toXYz(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

// 19a reserves a context pill (top 56 px) and a picks tray (bottom
// 96 px); the fit keeps every pin anchor inside the free rectangle.
const CHATMAP_INSET = { top: 56, right: 24, bottom: 96, left: 24 };
const PILL_H = 24;

const noSpace = (s) => String(s || "").replace(/\s+/g, "");

// 29a5: workplace pill label per language. The station name keeps
// data-no-i18n (never re-translated), so English is built here.
export function workPinLabel(name, lang) {
  if (lang === "en") return `Work · ${romanizeName(name)}`;
  return `회사 · ${name}`;
}

// 31j: the drag threshold shared by the svg pan handlers —
// 4 px in client px. A press-and-release inside it is a click.
export function pastDragThreshold(ax, ay, bx, by, px = 4) {
  return Math.hypot(bx - ax, by - ay) > px;
}

function pillTextWidthPx(text, px) {
  let tw = 0;
  for (const ch of String(text || "")) tw += ch.codePointAt(0) > 0xff ? px : Math.round(px * 0.58);
  return tw;
}

// 31f: A/B pick fills, home pins as real buttons, and a pin card
// over the map (담기 + 카드 보기 work on desktop and phone).
function letterFillFor(letter) {
  if (letter === "A") return MAP_COLORS.pinA;
  if (letter === "B") return MAP_COLORS.pinB;
  return null;
}

// 31f: the pin's accessible name — number + name + price +
// commute minutes, leaving out the parts that are missing.
// 31j: built per language in code (the DOM translator never sees
// it — the tag carries data-no-i18n), so English reads
// `Candidate 1: name · price · 5 min commute`.
export function pinAriaLabel(p, short, lang) {
  if (lang === "en") {
    const parts = [`Candidate ${p.n}: ${displayNameFor(p.candidate)}`];
    if (short) parts.push(short);
    if (p.commuteMin !== null && p.commuteMin !== undefined
      && Number.isFinite(Number(p.commuteMin))) {
      parts.push(`${Math.round(p.commuteMin)} min commute`);
    }
    return parts.join(" · ");
  }
  const parts = [`${p.n}번 후보 ${displayNameFor(p.candidate)}`];
  if (short) parts.push(short);
  if (p.commuteMin !== null && p.commuteMin !== undefined
    && Number.isFinite(Number(p.commuteMin))) {
    parts.push(`출근 ${Math.round(p.commuteMin)}분`);
  }
  return parts.join(" · ");
}

// 31h: 20 px ink control icons — inline SVG (Astryx semantic
// names do not include plus, minus, locate or expand).
function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 10h12" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor">
      <circle cx={10} cy={10} r={6} strokeWidth={2} />
      <path d="M10 1v3.5M10 15.5V19M1 10h3.5M15.5 10H19"
        strokeWidth={2} strokeLinecap="round" />
      <circle cx={10} cy={10} r={1.5} fill="currentColor" stroke="none" />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
    </svg>
  );
}

export function ChatMap({ map, cardHi, onPinHover, onPinClick, onViewCard,
  picks, onTogglePick, hasFilters, hideLegend, initialSelectedId }) {
  const mountRef = useRef(null);
  const [size, setSize] = useState(null);
  const [expanded, setExpanded] = useState(null);
  // 31f: the open pin card (pin id) and the hovered cluster.
  // 31m: initialSelectedId only seeds SSR / tests — clients open
  // cards by clicking pins.
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  // 31m: the phone credit's expanded full text.
  const [creditOpen, setCreditOpen] = useState(false);
  // 31m: chrome boxes measured from the DOM (stage px), set after
  // mount — null on SSR / first render, where the guessed boxes
  // below stand in.
  const [chrome, setChrome] = useState(null);
  // 31n: the fit inset measured from the same chrome (stage px) —
  // null on SSR / first render, where CHATMAP_INSET stands in.
  const [fitPad, setFitPad] = useState(null);
  const [clusterHi, setClusterHi] = useState(null);
  // 25a: screen-space zoom/pan (zoom around W/2, H/2).
  const [vt, setVt] = useState({ zoom: 1, panX: 0, panY: 0 });
  // 31h: the "you are here" marker (stage px, never stored outside
  // this component) and the locate-button state.
  const [you, setYou] = useState(null);
  const [locating, setLocating] = useState(false);
  // Rendered until the client proves otherwise, so SSR keeps the
  // button; a client without geolocation hides it after mount.
  const [geoOk, setGeoOk] = useState(true);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) setGeoOk(false);
  }, []);
  const [grabbing, setGrabbing] = useState(false);
  const dragRef = useRef(null);
  const dragged = useRef(false);
  // 31k: which pin (if any) the pointer went down on, with the
  // client coords — so a pointer-up on the same pin can open its
  // card even when the click event is retargeted elsewhere.
  const downPinRef = useRef(null);
  // 25a: basemap tiles that failed to load are never rendered again.
  const failedRef = useRef(new Set());
  const [failCount, setFailCount] = useState(0);
  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window === "undefined" || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize([r.width, r.height]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = (size && size[0]) || 640;
  const H = (size && size[1]) || 420;
  // 31m: measure the overlay chrome into stage-px obstacle boxes —
  // the filter row and title (siblings above this mount), the
  // legend, each right-column control (its buttons, not the
  // wrapper), the tray over the stage bottom, the credit, and the
  // open pin card. Each box is padded by 4 px. Re-measured on
  // resize and whenever the card, the credit, the picks or the
  // filters change.
  // 31n: the same pass also builds the fit inset from the measured
  // chrome — the top-left stack bottom + one tag, the tray cover
  // (or the credit height when the tray is off the map) + 16, the
  // control-column width + 16. The inset only re-fits when a side
  // moves more than 8 px, so no measure loop can form.
  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }
    const chatRoot = (el.closest && (el.closest(".ui-chat") || el.closest(".ui-chat-main"))) || null;
    const trayNode = (chatRoot && chatRoot.querySelector
      ? chatRoot.querySelector(".ui-picks-tray")
      : document.querySelector(".ui-picks-tray")) || null;
    const measure = () => {
      const stage = el.getBoundingClientRect();
      if (!(stage.width > 0) || !(stage.height > 0)) return;
      const sx = W / stage.width;
      const sy = H / stage.height;
      const toBox = (r) => ({
        x: (r.left - stage.left) * sx - 4,
        y: (r.top - stage.top) * sy - 4,
        w: r.width * sx + 8,
        h: r.height * sy + 8,
      });
      const visible = (node) => {
        if (!node || !node.getBoundingClientRect) return null;
        if (node.hasAttribute && node.hasAttribute("hidden")) return null;
        const r = node.getBoundingClientRect();
        if (!r || !(r.width > 0) || !(r.height > 0)) return null;
        return r;
      };
      const overlapRaw = (r) => {
        const ix0 = Math.max(r.left, stage.left);
        const ix1 = Math.min(r.right, stage.right);
        const iy0 = Math.max(r.top, stage.top);
        const iy1 = Math.min(r.bottom, stage.bottom);
        if (!(ix1 > ix0) || !(iy1 > iy0)) return null;
        return {
          x: (ix0 - stage.left) * sx,
          y: (iy0 - stage.top) * sy,
          w: (ix1 - ix0) * sx,
          h: (iy1 - iy0) * sy,
        };
      };
      const boxes = [];
      let stackBottom = 0;
      const pushTop = (node) => {
        const r = visible(node);
        if (!r) return;
        const b = toBox(r);
        boxes.push(b);
        stackBottom = Math.max(stackBottom, b.y + b.h);
      };
      const push = (node) => {
        const r = visible(node);
        if (r) boxes.push(toBox(r));
      };
      const scope = (el.closest && el.closest(".ui-chat-stage-body")) || el;
      if (scope && scope.querySelector) {
        pushTop(scope.querySelector(".ui-chatmap-filters"));
        pushTop(scope.querySelector(".ui-stage-title"));
      }
      pushTop(el.querySelector(".ui-chatmap-legend"));
      let colW = 0;
      const side = el.querySelector(".ui-chatmap-side");
      if (side && !(side.hasAttribute && side.hasAttribute("hidden"))) {
        const sr = visible(side);
        if (sr) {
          const so = overlapRaw(sr);
          if (so) colW = Math.max(colW, so.w);
        }
        for (const child of side.children || []) {
          if (child.classList && child.classList.contains("ui-chatmap-credit")) continue;
          push(child);
        }
      }
      // 31n: the tray's visible box over the stage is an obstacle
      // for the tag layout too.
      let trayCover = 0;
      const tr = visible(trayNode);
      if (tr) {
        const to = overlapRaw(tr);
        if (to) {
          trayCover = to.h;
          boxes.push({ x: to.x - 4, y: to.y - 4, w: to.w + 8, h: to.h + 8 });
        }
      }
      let creditH = 0;
      for (const sel of [".ui-chatmap-credit.is-phone",
        ".ui-chatmap-side .ui-chatmap-credit"]) {
        const cr = visible(el.querySelector(sel));
        if (cr) {
          const co = overlapRaw(cr);
          if (co) creditH = Math.max(creditH, co.h);
        }
      }
      push(el.querySelector(".ui-chatmap-credit.is-phone"));
      push(el.querySelector(".ui-chatmap-side .ui-chatmap-credit"));
      push(el.querySelector(".ui-chatmap-pincard"));
      setChrome((prev) => (
        JSON.stringify(prev) === JSON.stringify(boxes) ? prev : boxes));
      // 31n: the tallest tag sets the room above the topmost pin.
      const langM = currentLang();
      const compactM = W <= 480;
      let tagHM = 0;
      for (const p of ((map && map.pins) || [])) {
        try {
          const s = tagSizePx(p, map.tenure, langM, { compact: compactM });
          if (s && s.h > tagHM) tagHM = s.h;
        } catch { /* keep the tallest so far */ }
      }
      if (!(tagHM > 0)) tagHM = 56;
      const inset = fitInsetFromChrome({ W, H,
        top: stackBottom,
        bottom: trayCover > 0 ? trayCover : creditH,
        right: colW, tagH: tagHM });
      setFitPad((prev) => {
        if (prev && Math.abs(prev.top - inset.top) <= 8
          && Math.abs(prev.right - inset.right) <= 8
          && Math.abs(prev.bottom - inset.bottom) <= 8
          && Math.abs(prev.left - inset.left) <= 8) return prev;
        if (prev && JSON.stringify(prev) === JSON.stringify(inset)) return prev;
        return inset;
      });
    };
    measure();
    const RO = window.ResizeObserver;
    if (!RO) return undefined;
    const ro = new RO(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    if (trayNode) ro.observe(trayNode);
    return () => ro.disconnect();
  }, [W, H, selectedId, creditOpen, hasFilters, (map && map.pins && map.pins.length) || 0,
    (map && map.tenure) || "", ((picks && picks.length) || 0)]);
  // 31j: the rendering language (tags build their own lines, never
  // the DOM translator) and the compact phone tag size.
  const lang = currentLang();
  const compact = W <= 480;
  // 25a: wheel zoom around the cursor. A native non-passive listener
  // so preventDefault stops the page scroll.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (!(r.width > 0) || !(r.height > 0)) return;
      const px = (e.clientX - r.left) * (W / r.width);
      const py = (e.clientY - r.top) * (H / r.height);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setVt((v) => zoomAt(v, factor, px, py, W / 2, H / 2));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, H]);
  const m = map || {};
  const pins = m.pins || [];
  const regions = m.regions || [];
  // Fit the workplace + all candidates with a margin; before any
  // candidates exist, frame the covered regions so the panel fills.
  const focus = [];
  if (m.workPin) focus.push(m.workPin);
  for (const p of pins) focus.push(p);
  if (focus.length === 0) {
    for (const r of regions) {
      if (!Array.isArray(r.bbox)) continue;
      focus.push({ lon: r.bbox[0], lat: r.bbox[1] }, { lon: r.bbox[2], lat: r.bbox[3] });
    }
  }
  // A new focus set re-fits the map, so the zoom/pan resets —
  // and a new search clears the "you are here" marker with it.
  const focusKey = focus.map((p) => `${p.lon},${p.lat}`).join(";");
  useEffect(() => {
    setVt({ zoom: 1, panX: 0, panY: 0 });
    setYou(null);
  }, [focusKey]);
  // One projected space: fitMapView maps lon/lat into stage px, and
  // the viewBox IS that stage (0 0 W H) — never the raw degree view.
  // 25a: T applies the zoom/pan in screen space; every layer below
  // draws through toXYz, so pins, lines and labels always land inside
  // the frame while their sizes stay constant in px.
  // 31n: the fit uses the measured chrome inset (the fit button
  // below resets to this same fit); CHATMAP_INSET is the SSR /
  // first-render fallback.
  const fit = fitMapView(focus, W, H, MAP_FIT_MARGIN, fitPad || CHATMAP_INSET);
  const { midLat } = fit;
  const T = viewTransform({ ...vt, cx: W / 2, cy: H / 2 });
  const toXYz = (lon, lat) => T.apply(fit.toXY(lon, lat));
  const toLonLatZ = (x, y) => fit.toLonLat(...T.invert([x, y]));
  // 31h: my-location — the fix is read once per click and never
  // stored (no state outside this component, no URL, no network,
  // no log). The extent is the map's current lon/lat corners.
  const [exMinLon, exMaxLat] = toLonLatZ(0, 0);
  const [exMaxLon, exMinLat] = toLonLatZ(W, H);
  const onLocate = () => {
    const geo = (typeof navigator !== "undefined" && navigator.geolocation) || null;
    if (!geo) {
      toast.show("위치를 가져오지 못했어요. 브라우저에서 위치 권한을 확인해 주세요");
      return;
    }
    setLocating(true);
    geo.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lon = Number(pos && pos.coords && pos.coords.longitude);
        const lat = Number(pos && pos.coords && pos.coords.latitude);
        const r = locateResult(pos, {
          minLon: exMinLon, minLat: exMinLat,
          maxLon: exMaxLon, maxLat: exMaxLat, W, H,
        });
        if (!r.inside) {
          toast.show("지금 계신 곳이 이 지도 밖이에요");
          return;
        }
        setYou({ x: r.x, y: r.y });
        // Centre the fix, keeping the current zoom.
        const [bx, by] = fit.toXY(lon, lat);
        setVt((v) => {
          const z = Number(v.zoom) || 1;
          return { ...v, panX: -(bx - W / 2) * z, panY: -(by - H / 2) * z };
        });
      },
      () => {
        setLocating(false);
        toast.show("위치를 가져오지 못했어요. 브라우저에서 위치 권한을 확인해 주세요");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  };
  // 25a: light raster under the vector layers when the tile source
  // is available. 26k: the provider follows the map centre — USGS
  // topo in the US (direct, no relay, so apiBase may be null),
  // VWorld through the proxy elsewhere (apiBase null: no basemap).
  const apiBase = basemapApiBase();
  const [centerLon, centerLat] = toLonLatZ(W / 2, H / 2);
  const provider = basemapProvider(centerLon, centerLat);
  const tiles = (provider === "vworld" && apiBase === null) ? []
    : basemapTiles({ toLonLat: toLonLatZ, W, H,
      lat: midLat, metersPerPx: fit.metersPerPx / vt.zoom, provider });
  // 33a2: low-zoom underlay under the clipped normal tiles — same
  // view at min(z, 10), so out-of-area corners show the blurrier map
  // instead of bare ground. Skipped when it would duplicate the
  // normal tiles (z ≤ 10) or for USGS (no bounds). Not counted in
  // tiles, so basemapOn still counts only requested normal tiles.
  const tileKeys = new Set(tiles.map((t) => t.key));
  const underlay = (provider === "vworld" && apiBase !== null && tiles.length > 0)
    ? basemapUnderlayTiles({ toLonLat: toLonLatZ, W, H,
        z: tiles[0].z, provider }).filter((t) => !tileKeys.has(t.key))
    : [];
  const basemapOn = (provider === "usgs" || apiBase !== null)
    && failCount * 2 < tiles.length;
  // Constant screen sizes: one viewBox unit is one stage px at 1:1, so
  // literal px values stay readable however the map is zoomed.
  const fs = (n) => n;
  const green = m.green || {};
  // 21b: one greedy pill space (like placeLabels): the 회사 pill
  // (rank 0) and picked A/B pills (rank 1) always win; the rest shift
  // with a short leader line or fold into a "+N" cluster pill that
  // expands on click. Anchors never move, only pills do.
  const pillItems = [];
  if (m.workPin && Number.isFinite(m.workPin.lon) && Number.isFinite(m.workPin.lat)) {
    const [x, y] = toXYz(m.workPin.lon, m.workPin.lat);
    const label = workPinLabel(m.workPin.name, lang);
    // 31f: the work marker carries a 10 px square glyph before the
    // text, so its box reserves the extra width.
    pillItems.push({ id: "work", kind: "work", x, y,
      w: pillTextWidthPx(label, 12) + 38, h: 26, rank: 0 });
  }
  for (const p of pins) {
    const [x, y] = toXYz(p.lon, p.lat);
    // 31g: home pins lay out as two-part tags, so the collision
    // boxes are the measured tag sizes. 31j: measured on the
    // rendering-language lines, in the phone size when narrow.
    // 31m: the compact form (header + price, no commute line) rides
    // along as alt for crowded stages.
    const sz = tagSizePx(p, m.tenure, lang, { compact });
    const shortSz = tagSizePx(p, m.tenure, lang, { compact, short: true });
    pillItems.push({ id: p.id, kind: "pill", x, y,
      w: sz.w, h: sz.h, alt: { w: shortSz.w, h: shortSz.h },
      rank: p.picked ? 1 : 2 });
  }
  // 31m: overlay chrome the tags must never cover — measured from
  // the DOM after mount (the filter row, title, legend, right
  // controls, tray, credit, open pin card). Until the first measure
  // (SSR included) the old guessed boxes stand in: the top-left
  // stack and the right control column. 31n: the chrome is already
  // occupied before rank 0 places, so the work marker moves too.
  const chromeFallback = [
    { x: 0, y: 0, w: Math.min(300, W * 0.5), h: hasFilters ? 140 : 100 },
    { x: W - 64, y: 0, w: 64, h: H },
  ];
  const chromeObstacles = chrome || chromeFallback;
  const laid = layoutMapPills(pillItems, W, H, chromeObstacles);
  const layById = new Map(laid.map((l) => [l.id, l]));
  // Pills folded into a cluster render through the cluster instead —
  // the open cluster fans its members out below.
  const clustered = new Set();
  for (const l of laid) {
    if (l.kind !== "cluster" || !l.members) continue;
    for (const mb of l.members) clustered.add(mb.id);
  }
  const pinBoxes = laid.map((l) => l.box).filter(Boolean);
  const hitsPinBox = (x, y, pad = 4) => pinBoxes.some((b) =>
    x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad);
  // Stations near the action only: within 1.5 km of a pin or the
  // workplace, nearest 14.
  const anchors = pins.map((p) => ({ lon: p.lon, lat: p.lat }));
  if (m.workPin && Number.isFinite(m.workPin.lon) && Number.isFinite(m.workPin.lat)) {
    anchors.push(m.workPin);
  }
  const nearStations = (m.stations || [])
    .map((s) => {
      let d = Infinity;
      for (const a of anchors) {
        if (!Number.isFinite(s.lon) || !Number.isFinite(s.lat)) break;
        d = Math.min(d, haversineKm(s.lon, s.lat, a.lon, a.lat));
      }
      return { s, d };
    })
    .filter((e) => e.d <= 1.5)
    .sort((a, b) => a.d - b.d)
    .slice(0, 14)
    .map((e) => e.s);
  // 21b: station names for the stations within the view — 11 px
  // grey, the same greedy rule (first free slot wins, otherwise the
  // name is skipped). Dots stay for every nearby station.
  const seenStation = new Set();
  const stationPts = [];
  // The 회사 pill already names the workplace station — labelling
  // its dot too would print the name twice. The dot stays.
  const workName = noSpace(m.workPin && m.workPin.name);
  for (const s of nearStations) {
    if (workName && noSpace(s.name) === workName) continue;
    const key = noSpace(s.name);
    if (seenStation.has(key)) continue;
    seenStation.add(key);
    const [x, y] = toXYz(s.lon, s.lat);
    stationPts.push({ name: s.name, x, y });
  }
  const stationLabels = layoutStationLabels(stationPts, W, H, pinBoxes);
  const stationLabelBoxes = stationLabels.map((l) => ({ x: l.x,
    y: l.y - 10, w: stationNameWidthPx(l.name), h: 13 }));
  // 21b: the candidates' 동 or neighbourhood names, at most 4 — quiet
  // bearings that yield to pills and station names.
  const dongPlaced = layoutStationLabels(
    pickDongLabels(pins.map((p) => ({ lon: p.lon, lat: p.lat,
      dong: p.candidate && p.candidate.dong })))
      .map((d) => {
        const [x, y] = toXYz(d.lon, d.lat);
        return { name: d.text, x, y };
      }),
    W, H, [...pinBoxes, ...stationLabelBoxes]);
  // 25a: drag pans; a drag past 4 px is not a pin click.
  const stagePt = (clientX, clientY) => {
    const el = mountRef.current;
    if (!el) return [W / 2, H / 2];
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return [W / 2, H / 2];
    return [(clientX - r.left) * (W / r.width), (clientY - r.top) * (H / r.height)];
  };
  const onSvgPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragged.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, vt, captured: false };
  };
  const onSvgPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    // 31j: past the drag threshold this is a pan — capture the
    // pointer (and show grabbing) only now, so a press-and-release
    // keeps its click on the real target (the tag button). Touch
    // pans through this same handler.
    if (!pastDragThreshold(d.x, d.y, e.clientX, e.clientY)) return;
    if (!d.captured) {
      d.captured = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ }
      setGrabbing(true);
    }
    dragged.current = true;
    const el = mountRef.current;
    const r = el ? el.getBoundingClientRect() : null;
    const sx = r && r.width > 0 ? W / r.width : 1;
    const sy = r && r.height > 0 ? H / r.height : 1;
    setVt({ zoom: d.vt.zoom,
      panX: d.vt.panX + (e.clientX - d.x) * sx,
      panY: d.vt.panY + (e.clientY - d.y) * sy });
  };
  const onSvgPointerUp = () => {
    dragRef.current = null;
    setGrabbing(false);
  };
  const onSvgDoubleClick = (e) => {
    const [px, py] = stagePt(e.clientX, e.clientY);
    setVt((v) => zoomAt(v, 2, px, py, W / 2, H / 2));
  };
  const handlePinClick = (id) => {
    if (dragged.current) { dragged.current = false; return; }
    // 31f: the pin opens its card on the map; 카드 보기 scrolls to
    // the card (onPinClick stays for compatibility).
    setSelectedId(id);
    if (onPinClick) onPinClick(id);
  };
  // 31f: Esc closes the pin card.
  useEffect(() => {
    if (!selectedId || typeof window === "undefined") return undefined;
    const onKey = (e) => { if (e.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);
  // 31f: shared button behaviour for every home pin (main pills and
  // fanned-out cluster members). Focus also highlights the card, so
  // the 2 px ink hover outline doubles as the focus ring.
  const pinButtonProps = (p, short) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": pinAriaLabel(p, short, lang),
    onMouseEnter: () => onPinHover && onPinHover(`home:${p.id}`),
    onMouseLeave: () => onPinHover && onPinHover(null),
    onFocus: () => onPinHover && onPinHover(`home:${p.id}`),
    onBlur: () => onPinHover && onPinHover(null),
    onPointerDown: (e) => {
      downPinRef.current = { id: p.id, x: e.clientX, y: e.clientY };
    },
    // 31k: belt and braces — open the card when the pointer goes
    // down and up on the same pin without passing the drag
    // threshold. onClick stays for keyboard and assistive tech;
    // setting the same id twice is idempotent, so no double-open.
    onPointerUp: (e) => {
      const d = downPinRef.current;
      downPinRef.current = null;
      if (!d || d.id !== p.id) return;
      if (pastDragThreshold(d.x, d.y, e.clientX, e.clientY)) return;
      handlePinClick(p.id);
    },
    onKeyDown: (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      handlePinClick(p.id);
    },
    onClick: () => handlePinClick(p.id),
    style: { cursor: "pointer" },
  });
  // 31g: the two-part price tag — an 18 px header strip (number·
  // area, white on ink, or on the A/B colour when picked) over a
  // white body (price line, commute line) with a 1 px border in the
  // header colour and a small tail at the bottom-left corner. Hover
  // adds a 2 px ink outline around header + body.
  const homeTagShape = (box, lines, accent, hi, isCompact) => {
    const x = box.x, y = box.y, w = box.w, h = box.h;
    const cx = x + w / 2;
    // 31j: phone tags use the compact type sizes; every tag line
    // is built in code per language, so the translator skips them.
    const t = tagFontPx({ compact: isCompact });
    return (
      <g filter="url(#chat-pill-shadow)">
        <path d={`M${x},${y + 18} L${x},${y + 8} A8,8 0 0 1 ${x + 8},${y} L${x + w - 8},${y} A8,8 0 0 1 ${x + w},${y + 8} L${x + w},${y + 18} Z`}
          fill={accent} />
        <path d={`M${x},${y + 18} L${x + w},${y + 18} L${x + w},${y + h - 8} A8,8 0 0 1 ${x + w - 8},${y + h} L${x + 8},${y + h} A8,8 0 0 1 ${x},${y + h - 8} Z`}
          fill={MAP_COLORS.pinFill} stroke={accent} strokeWidth={fs(1)} />
        <text x={cx} y={y + fs(13)} fontSize={fs(t.header)} fontWeight={600}
          textAnchor="middle" fill={MAP_COLORS.pinFill} data-no-i18n>{lines.header}</text>
        <text x={x + fs(t.padX)} y={y + 18 + fs(17)} fontSize={fs(t.price)} fontWeight={700}
          fill={MAP_COLORS.pinText} data-no-i18n>{lines.price}</text>
        {lines.commute && (
          <text x={x + fs(t.padX)} y={y + 18 + fs(36)} fontSize={fs(t.commute)} fontWeight={600}
            fill={MAP_COLORS.commute} data-no-i18n>{lines.commute}</text>
        )}
        <polygon points={`${x + fs(9)},${y + h} ${x + fs(17)},${y + h} ${x + fs(11)},${y + h + 6}`}
          fill={accent} />
        {hi && (
          <rect x={x - fs(1.5)} y={y - fs(1.5)} width={w + fs(3)} height={h + fs(3)}
            rx={fs(9.5)} fill="none" stroke={MAP_COLORS.pinHi} strokeWidth={fs(2)} />
        )}
      </g>
    );
  };
  // 31f: a click on empty map closes the pin card (a drag is not a click).
  const onSvgBackgroundClick = (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-layer") === "map-ground") {
      if (dragged.current) { dragged.current = false; return; }
      setSelectedId(null);
    }
  };
  // 31k: home tags render in a fixed order (pin rank, then id) so a
  // hover highlight never moves the clickable node in the DOM —
  // moving it between mousedown and mouseup retargets the browser's
  // click to the svg, so the pin card never opens. The highlighted /
  // selected tag is drawn again as a non-interactive copy in a top
  // layer below. (Confirmed in source: the old pillOrder/ordered
  // sorts re-ordered the live <g> nodes on every cardHi change; no
  // live browser was available here to re-run the mouse click.)
  const tagOrder = [...pins].sort((a, b) =>
    (((a.n ?? 0) - (b.n ?? 0)) || String(a.id).localeCompare(String(b.id))));
  // 31m: the map credit — the full string on desktop (in the side
  // column), one short line on phones (≤ 480 px, CSS picks which
  // shows). Both live in data-no-i18n nodes built for the language.
  const creditFull = !basemapOn
    ? "© OpenStreetMap contributors"
    : provider === "usgs"
      ? "Map: USGS The National Map"
      : lang === "en"
        ? "Map © MOLIT Spatial Information Open Platform (VWorld) · © OpenStreetMap contributors"
        : "지도 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap contributors";
  const creditShort = !basemapOn
    ? "© OpenStreetMap"
    : provider === "usgs"
      ? "© USGS"
      : "© VWorld · © OpenStreetMap";
  return (
    <div ref={mountRef} className="ui-chatmap" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
        role="img" aria-label="후보 지도: 출근지와 후보 집 위치" preserveAspectRatio="xMidYMid slice"
        style={{ cursor: grabbing ? "grabbing" : "grab" }}
        onPointerDown={onSvgPointerDown} onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp} onPointerCancel={onSvgPointerUp}
        onDoubleClick={onSvgDoubleClick} onClick={onSvgBackgroundClick}>
        <defs>
          <filter id="chat-pill-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={1} stdDeviation={2}
              floodColor="#000000" floodOpacity={0.25} />
          </filter>
          <filter id="basemap-mute">
            <feColorMatrix type="saturate" values={BASEMAP_MUTE.saturate} />
            <feComponentTransfer>
              <feFuncR type="linear" slope={BASEMAP_MUTE.slope} intercept={1 - BASEMAP_MUTE.slope} />
              <feFuncG type="linear" slope={BASEMAP_MUTE.slope} intercept={1 - BASEMAP_MUTE.slope} />
              <feFuncB type="linear" slope={BASEMAP_MUTE.slope} intercept={1 - BASEMAP_MUTE.slope} />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={MAP_COLORS.ground}
          data-layer="map-ground" />
        <g filter="url(#basemap-mute)" opacity={currentLang() === "en" ? 0.45 : 1}>
        {underlay.filter((t) => !failedRef.current.has(t.key)).map((t) => {
          const [x0, y0] = toXYz(t.nw[0], t.nw[1]);
          const [x1, y1] = toXYz(t.se[0], t.se[1]);
          return (
            <image key={`under/${t.key}`} href={basemapTileUrl(apiBase, t.z, t.y, t.x, { provider })}
              x={Math.min(x0, x1)} y={Math.min(y0, y1)}
              width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)}
              preserveAspectRatio="none" pointerEvents="none"
              onError={() => {
                failedRef.current.add(t.key);
              }} />
          );
        })}
        {tiles.filter((t) => !failedRef.current.has(t.key)).map((t) => {
          const [x0, y0] = toXYz(t.nw[0], t.nw[1]);
          const [x1, y1] = toXYz(t.se[0], t.se[1]);
          return (
            <image key={t.key} href={basemapTileUrl(apiBase, t.z, t.y, t.x, { provider })}
              x={Math.min(x0, x1)} y={Math.min(y0, y1)}
              width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)}
              preserveAspectRatio="none" pointerEvents="none"
              onError={() => {
                if (!failedRef.current.has(t.key)) {
                  failedRef.current.add(t.key);
                  setFailCount((c) => c + 1);
                }
              }} />
          );
        })}
        </g>
        {!basemapOn && (<>
        {(green.parks || []).map((ring, i) => (
          <polygon key={`pk${i}`} points={ptsAttr(ring, toXYz)} fill={MAP_COLORS.park} />
        ))}
        {(green.water || []).map((ring, i) => (
          <polygon key={`gw${i}`} points={ptsAttr(ring, toXYz)} fill={MAP_COLORS.water} />
        ))}
        {(m.tileWater || []).map((wseg, i) => (wseg.closed ? (
          <polygon key={`tw${i}`} points={ptsAttr(wseg.pts, toXYz)}
            fill={MAP_COLORS.water}>
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polygon>
        ) : (
          <polyline key={`tw${i}`} points={ptsAttr(wseg.pts, toXYz)} fill="none"
            stroke={MAP_COLORS.water} strokeWidth={fs(3)}
            strokeLinecap="round" strokeLinejoin="round">
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polyline>
        )))}
        {(m.roads || []).filter((r) => r.cls === "trunk").map((r, i) => (
          <polyline key={`rdct${i}`} points={ptsAttr(r.pts, toXYz)} fill="none"
            stroke={MAP_COLORS.roadCasing} strokeWidth={fs(7)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls !== "trunk").map((r, i) => (
          <polyline key={`rdcp${i}`} points={ptsAttr(r.pts, toXYz)} fill="none"
            stroke={MAP_COLORS.roadCasing} strokeWidth={fs(5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls === "trunk").map((r, i) => (
          <polyline key={`rdt${i}`} points={ptsAttr(r.pts, toXYz)} fill="none"
            stroke={MAP_COLORS.road} strokeWidth={fs(5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls !== "trunk").map((r, i) => (
          <polyline key={`rdp${i}`} points={ptsAttr(r.pts, toXYz)} fill="none"
            stroke={MAP_COLORS.road} strokeWidth={fs(3.5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        </>)}
        {(m.lines || []).map((l, i) => (
          <polyline key={`casing:${l.id}:${l.direction || ""}:${i}`} points={ptsAttr(l.pts, toXYz)} fill="none"
            stroke="#ffffff" strokeWidth={fs(4.5)}
            strokeLinejoin="round" strokeLinecap="round">
            <title>{l.name}</title>
          </polyline>
        ))}
        {(m.lines || []).map((l, i) => (
          <polyline key={`${l.id}:${l.direction || ""}:${i}`} points={ptsAttr(l.pts, toXYz)} fill="none"
            stroke={l.color} strokeWidth={fs(2.5)}
            strokeLinejoin="round" strokeLinecap="round" opacity={1}>
            <title>{l.name}</title>
          </polyline>
        ))}
        {nearStations.map((s, i) => {
          const [x, y] = toXYz(s.lon, s.lat);
          return (
            <g key={`${s.line}:${s.name}:${i}`}>
              <circle cx={x} cy={y} r={fs(3.5)}
                fill={MAP_COLORS.stationDot} stroke={MAP_COLORS.stationRing} strokeWidth={fs(1.5)}>
                <title>{s.name}</title>
              </circle>
            </g>
          );
        })}
        {stationLabels.map((l, i) => (
          <text key={`stn${i}`} x={l.x} y={l.y} fontSize={fs(11)}
            fill={MAP_COLORS.regionLabel} stroke="#ffffff" strokeWidth={fs(3)}
            paintOrder="stroke" strokeLinejoin="round">{l.name}</text>
        ))}
        {dongPlaced.map((l, i) => (
          <text key={`dong${i}`} data-layer="dong-label"
            x={l.x + stationNameWidthPx(l.name) / 2} y={l.y} fontSize={fs(12)}
            fontWeight={500} textAnchor="middle"
            fill={MAP_COLORS.regionLabel} stroke="#ffffff" strokeWidth={fs(3)}
            paintOrder="stroke" strokeLinejoin="round">{l.name}</text>
        ))}
        {(m.commutes || []).flatMap((c) => c.legs.flatMap((leg, i) => [
          <polyline key={`${c.pinId}c${i}`} points={ptsAttr(leg.pts, toXYz)} fill="none"
            stroke="#ffffff" strokeWidth={fs(7)}
            strokeLinejoin="round" strokeLinecap="round" />,
          <polyline key={`${c.pinId}${i}`} points={ptsAttr(leg.pts, toXYz)} fill="none"
            stroke={leg.color} strokeWidth={fs(4)}
            strokeLinejoin="round" strokeLinecap="round">
            <title>{`${c.label} 출근길`}</title>
          </polyline>,
        ]))}
        {(m.commutes || []).map((c) => {
          const leg = c.legs[0];
          if (!leg || c.minutes === null || c.minutes === undefined) return null;
          const mid = leg.pts[Math.floor(leg.pts.length / 2)];
          const [x, y] = toXYz(mid[0], mid[1]);
          const label = `${Math.round(c.minutes)}분`;
          const cw = label.length * 11 + 16;
          return (
            <g key={`cm${c.pinId}`}>
              <rect x={x - cw / 2} y={y - fs(9)} width={cw} height={fs(18)} rx={fs(9)}
                fill="#ffffff" stroke="#e2ddd3" strokeWidth={fs(1)} />
              <text x={x} y={y + fs(4)} fontSize={fs(11)} fontWeight={600} textAnchor="middle"
                fill={MAP_COLORS.pinText}>{label}</text>
            </g>
          );
        })}
        {regions.map((r) => {
          if (!Array.isArray(r.bbox)) return null;
          const [cx, cy] = toXYz((r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2);
          // 19h: centred pills can cover the label spot — try offsets
          // before skipping; skip only if every spot collides.
          const spot = [[0, 0], [0, 28], [0, -28], [60, 0], [-60, 0]]
            .map(([dx, dy]) => [cx + dx, cy + dy])
            .find(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H && !hitsPinBox(x, y));
          if (!spot) return null;
          const [x, y] = spot;
          // 31f: region names are plain text, never buttons.
          return (
            <text key={r.id} data-layer="region-label" x={x} y={y}
              fontSize={fs(12)} fontWeight={500} letterSpacing="0.02em"
              fill={MAP_COLORS.regionLabel} textAnchor="middle">
              {r.label}
            </text>
          );
        })}
        {(() => {
          const l = layById.get("work");
          if (!m.workPin || !l) return null;
          const [px, py] = toXYz(m.workPin.lon, m.workPin.lat);
          const { box } = l;
          const label = workPinLabel(m.workPin.name, lang);
          // 31f: the work marker is a label, not a button — an ink
          // rounded rect (chip radius, never a pill) with a 10 px
          // white square glyph before the text, matching "■ 회사" in
          // the legend. No pointer, no hover.
          const gx = box.x + fs(10);
          const gy = box.y + box.h / 2 - fs(5);
          const tx = gx + fs(10 + 6);
          const cx = box.x + box.w / 2;
          return (
            <g key="work" data-layer="work-marker">
              {l.leader && (
                <line x1={l.leader[0]} y1={l.leader[1]} x2={px} y2={py}
                  stroke={MAP_COLORS.workPin} strokeWidth={fs(1.5)} />
              )}
              <g filter="url(#chat-pill-shadow)">
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={fs(8)}
                  fill={MAP_COLORS.workPin} />
                <rect x={gx} y={gy} width={fs(10)} height={fs(10)}
                  fill={MAP_COLORS.pinFill} />
                <text x={tx} y={box.y + fs(17)} fontSize={fs(12)} fontWeight={600}
                  textAnchor="start" fill={MAP_COLORS.pinFill} data-no-i18n>{label}</text>
              </g>
              {!l.leader && (
                <polygon points={`${cx - fs(5)},${box.y + box.h} ${cx + fs(5)},${box.y + box.h} ${px},${py}`}
                  fill={MAP_COLORS.workPin} />
              )}
            </g>
          );
        })()}
        {(() => {
          // 31b: two passes over the same ordered list so a close pin's
          // dot and leader never paint over another pin's pill. Same
          // geometry as the old single pass; the highlighted pill last.
          const geom = (p) => {
            const l = layById.get(p.id);
            const [px, py] = toXYz(p.lon, p.lat);
            // 31g: the tag's three lines and its measured box.
            // 31m: a compact placement paints without the commute
            // line (the aria-label still names the minutes).
            const isShort = !!(l && l.short);
            const { header, price, commute } = tagLines(p, { tenure: m.tenure, lang });
            const lines = isShort ? { header, price, commute: null } : { header, price, commute };
            const sz = tagSizePx(p, m.tenure, lang, { compact, short: isShort });
            const box = (l && l.box) || { x: px - sz.w / 2, y: py - fs(12) - sz.h, w: sz.w, h: sz.h };
            const hi = cardHi === `home:${p.id}`;
            const picked = !!p.picked;
            // 31f: a picked tag wears its letter's colour (A/B) in
            // the header and border; later letters fall back to the
            // old picked blue. Hover is a 2 px ink outline + lift,
            // never a fill.
            const accent = picked
              ? (letterFillFor(p.letter) || MAP_COLORS.pinPicked)
              : MAP_COLORS.pinText;
            const needLeader = !!(l && l.leader);
            const tailTipX = box.x + fs(11);
            const tailTipY = box.y + box.h + 6;
            const zoom = hi
              ? `translate(${tailTipX} ${tailTipY}) scale(1.08) translate(${-tailTipX} ${-tailTipY})` : undefined;
            return { l, px, py, header: lines.header, price: lines.price,
              commute: lines.commute, box, hi, picked,
              accent, needLeader, zoom };
          };
          // 31k: pills stay in the fixed order — never re-sorted by
          // hover. The highlighted pin's outline is re-drawn as a
          // separate non-interactive copy in the top layer below.
          const visible = tagOrder.filter((p) => !clustered.has(p.id));
          const hiPin = visible.find((p) => cardHi === `home:${p.id}`)
            || visible.find((p) => p.id === selectedId) || null;
          return (
            <>
              {visible.map((p) => {
                const g = geom(p);
                // 31g: a tag sitting right on its spot needs no
                // leader and no ground dot; only a moved tag keeps
                // the 31f leader line and ground dot.
                if (!g.needLeader) return null;
                return (
                  <g key={`pin-under-${p.id}`}>
                    {g.l.leader && (
                      <line x1={g.l.leader[0]} y1={g.l.leader[1]} x2={g.px} y2={g.py}
                        stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
                    )}
                    {/* 31f: the ground dot is ink-2 with a white ring
                      (picked: the A/B colour) — never the black of
                      the work marker. */}
                    <circle cx={g.px} cy={g.py} r={fs(4)}
                      fill={g.picked ? g.accent : MAP_COLORS.pinDot}
                      stroke={MAP_COLORS.pinFill} strokeWidth={fs(1.5)} />
                  </g>
                );
              })}
              {visible.map((p) => {
                const g = geom(p);
                // 31g: the invisible hit rect covers the whole tag
                // (44 px or taller, so always ≥ 32 px).
                return (
                  <g key={`pin-pill-${p.id}`} data-layer="home-pin"
                    {...pinButtonProps(p, g.price)}>
                    <rect x={g.box.x - fs(4)} y={g.box.y}
                      width={g.box.w + fs(8)} height={g.box.h}
                      fill="transparent" />
                    <g transform={g.zoom}>
                      {homeTagShape(g.box, g, g.accent, g.hi, compact)}
                    </g>
                  </g>
                );
              })}
              {hiPin && (() => {
                // 31k: the top-layer copy of the highlighted tag —
                // outline only, no handlers, no button role, out of
                // the hit path. The real clickable <g> above never
                // moves; data-layer avoids the "home-pin" name so pin
                // counts and label sequences are unchanged.
                const g = geom(hiPin);
                return (
                  <g key="pin-hi-top" data-layer="home-pin-top"
                    aria-hidden="true" pointerEvents="none">
                    <g transform={g.zoom}>
                      <rect x={g.box.x - fs(1.5)} y={g.box.y - fs(1.5)}
                        width={g.box.w + fs(3)} height={g.box.h + fs(3)}
                        rx={fs(9.5)} fill="none"
                        stroke={MAP_COLORS.pinHi} strokeWidth={fs(2)} />
                    </g>
                  </g>
                );
              })()}
            </>
          );
        })()}
        {laid.filter((l) => l.kind === "cluster").map((l) => {
          const open = expanded === l.id;
          // 31g: the cluster is a button — a count circle (soft
          // accent tint, white ring, ink count, no "+").
          const d = clusterSizePx(l.count);
          const cx = l.box.x + l.box.w / 2;
          const cy = l.box.y + l.box.h / 2;
          const hi = clusterHi === l.id;
          const toggle = () => setExpanded(open ? null : l.id);
          return (
            <g key={l.id} data-layer="cluster" role="button" tabIndex={0}
              aria-label={`가까운 후보 ${l.count}곳 펼치기`}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                toggle();
              }}
              onMouseEnter={() => setClusterHi(l.id)}
              onMouseLeave={() => setClusterHi(null)}
              onFocus={() => setClusterHi(l.id)}
              onBlur={() => setClusterHi(null)}
              style={{ cursor: "pointer" }}>
              {l.leader && (
                <line x1={l.leader[0]} y1={l.leader[1]} x2={l.x} y2={l.y}
                  stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
              )}
              <g filter="url(#chat-pill-shadow)">
                <circle cx={cx} cy={cy} r={fs(d / 2)}
                  fill={MAP_COLORS.cluster}
                  stroke={hi ? MAP_COLORS.pinHi : "#ffffff"}
                  strokeWidth={fs(2)} />
                <text x={cx} y={cy + fs(5)} fontSize={fs(15)} fontWeight={700}
                  textAnchor="middle" fill={MAP_COLORS.pinText}>{l.count}</text>
              </g>
              <title>{`가까운 후보 ${l.count}곳 묶음 — 눌러서 펼치기`}</title>
            </g>
          );
        })}
        {((laid.find((l) => l.kind === "cluster" && l.id === expanded) || {}).members || [])
          .map((mb, i, arr) => {
            const pin = pins.find((p) => p.id === mb.id);
            if (!pin) return null;
            const cluster = laid.find((l) => l.id === expanded);
            // 31g: fanned-out members draw as the new tags.
            const sz = tagSizePx(pin, m.tenure, lang, { compact });
            const R = Math.max(48, 18 * arr.length);
            const ang = (-Math.PI / 2) + ((i + 0.5) * 2 * Math.PI) / arr.length;
            const bx = cluster.box.x + cluster.box.w / 2 + R * Math.cos(ang) - sz.w / 2;
            const by = cluster.box.y + cluster.box.h / 2 + R * Math.sin(ang) - sz.h / 2;
            const [px, py] = toXYz(pin.lon, pin.lat);
            // 31f: fanned-out members are home pins too — buttons
            // with the same fills and hover outline.
            const hi = cardHi === `home:${pin.id}`;
            const picked = !!pin.picked;
            const accent = picked
              ? (letterFillFor(pin.letter) || MAP_COLORS.pinPicked)
              : MAP_COLORS.pinText;
            const box = { x: bx, y: by, w: sz.w, h: sz.h };
            const lines = tagLines(pin, { tenure: m.tenure, lang });
            return (
              <g key={`open-${mb.id}`} data-layer="home-pin"
                {...pinButtonProps(pin, lines.price)}>
                <rect x={bx - fs(4)} y={by}
                  width={sz.w + fs(8)} height={sz.h} fill="transparent" />
                <line x1={bx + sz.w / 2} y1={by + sz.h} x2={px} y2={py}
                  stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
                <circle cx={px} cy={py} r={fs(4)}
                  fill={picked ? accent : MAP_COLORS.pinDot}
                  stroke={MAP_COLORS.pinFill} strokeWidth={fs(1.5)} />
                {homeTagShape(box, lines, accent, hi, compact)}
              </g>
            );
          })}
        {/* 31h: "you are here" — an 8 px accent dot with a white
          ring and a 24 px halo. Click-only, cleared on new data. */}
        {you && (
          <g data-layer="you-are-here">
            <circle cx={you.x} cy={you.y} r={fs(12)}
              fill="var(--ds-accent)" opacity={0.25} />
            <circle cx={you.x} cy={you.y} r={fs(8)}
              fill="var(--ds-accent)"
              stroke="#ffffff" strokeWidth={fs(2)} />
          </g>
        )}
      </svg>
      {/* 31g: the legend describes the tag — number·area /
        price / commute minutes; A/B are picked homes. The 분
        badges on commute paths appear only for picked homes. */}
      {/* 32a: hidden while the map has no candidates, so only the
        empty card shows at the top-left. */}
      {!hideLegend && (
      <div role="note" className={hasFilters
        ? "ui-float ui-chatmap-legend has-filters" : "ui-float ui-chatmap-legend"}>
        {provider === "usgs"
          ? "번호·면적 / 가격 / 출근 시간 · Ⓐ Ⓑ 담은 집 · ■ 회사"
          : "번호·면적 / 가격 / 출근 시간 · Ⓐ Ⓑ 담은 집 · ■ 회사 · ━ 지하철"}
      </div>
      )}
      {(() => {
        // 31f: the pin card — anchored above its pin (below when
        // there is no room), on the shared float surface. Shows the
        // same name / price / commute lines as the candidate card,
        // with 담기·빼기 and 카드 보기. Esc, empty-map click, or
        // opening another pin closes it.
        // 31m: is-docked marks the phone docking (CSS applies it at
        // ≤ 480 px). On desktop the card is clamped off the measured
        // chrome — below the top-left stack, left of the right
        // column. While it is open on a phone, the credit and the
        // control column hide (hidden, not opacity).
        const pin = pins.find((p) => p.id === selectedId);
        if (!pin) return null;
        const model = pinCardModel(pin, { tenure: m.tenure, picks: picks || [] });
        const lay = layById.get(pin.id);
        const anchor = lay ? { x: lay.box.x + lay.box.w / 2, y: lay.box.y }
          : (() => { const [x, y] = toXYz(pin.lon, pin.lat); return { x, y }; })();
        const boxHit2 = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w
          && a.y < b.y + b.h && b.y < a.y + a.h;
        const CARD_W = 240;
        const CARD_H = 190;
        let cardBelow = anchor.y < 170;
        let cardLeft = Math.min(Math.max(anchor.x, 128), Math.max(W - 128, 128));
        let cardBox = { x: cardLeft - CARD_W / 2,
          y: cardBelow ? anchor.y + (lay ? lay.box.h : PILL_H) + 8 : anchor.y - 8 - CARD_H,
          w: CARD_W, h: CARD_H };
        for (const o of chromeObstacles) {
          if (!o || !(o.w > 0) || !(o.h > 0)) continue;
          if (!boxHit2(cardBox, o)) continue;
          if (o.x < W / 2) {
            cardBelow = true;
            cardBox = { ...cardBox, y: o.y + o.h + 8 };
          } else {
            cardBox = { ...cardBox, x: o.x - CARD_W - 8 };
          }
        }
        cardLeft = Math.min(Math.max(cardBox.x + CARD_W / 2, 128), Math.max(W - 128, 128));
        const cardTop = cardBelow ? cardBox.y : cardBox.y + CARD_H;
        const disc = model.picked ? (pin.letter || String(pin.n)) : String(pin.n);
        const viewCard = () => {
          setSelectedId(null);
          if (onViewCard) onViewCard(pin.id);
          else if (onPinClick) onPinClick(pin.id);
        };
        return (
          <div className={`ui-float ui-chatmap-pincard is-docked${cardBelow ? " is-below" : ""}`}
            role="dialog" aria-label={`${model.title} 후보 카드`}
            style={{ left: cardLeft, top: cardTop }}>
            <div className="ui-pincard-row">
              <span className="ui-pick-disc" aria-hidden="true"
                {...(/^[AB]$/.test(disc) ? { "data-home": disc } : null)}>{disc}</span>
              <span className="ui-pincard-title">{model.title}</span>
              <button type="button" className="ui-pincard-x" aria-label="핀 카드 닫기"
                onClick={() => setSelectedId(null)}>×</button>
            </div>
            <div className="ui-pincard-price">{model.price}</div>
            <div className="ui-pincard-commute">{model.commute}</div>
            <div className="ui-pincard-actions">
              <button type="button" className="ui-pincard-btn"
                disabled={!model.canPick}
                aria-label={`${model.title} ${model.picked ? "빼기" : "담기"}`}
                onClick={() => onTogglePick && onTogglePick(pin.candidate)}>
                {model.picked ? "빼기" : "담기"}
              </button>
              <button type="button" className="ui-pincard-btn ghost"
                aria-label={`${model.title} 카드 보기`}
                onClick={viewCard}>카드 보기</button>
            </div>
            {!model.canPick && (
              <div className="ui-pincard-meta">2곳까지 담을 수 있어요</div>
            )}
          </div>
        );
      })()}
      {/* 31h: one bottom-right control stack — my-location, the
        zoom pair on one card, then fit. Icon buttons, same zoom
        functions as before. */}
      {/* 31m: on phones an open pin card docks over the bottom, so
        the column hides with it (hidden, not opacity) and returns
        when the card closes. */}
      <div className="ui-chatmap-side"
        hidden={!!(selectedId && W <= 480) || undefined}>
        {geoOk && (
          <button type="button" className="ui-float" aria-label="내 위치"
            title="내 위치" aria-busy={locating}
            onClick={onLocate}><LocateIcon /></button>
        )}
        <div className="ui-float ui-chatmap-zoom" role="group" aria-label="지도 확대 축소">
          <button type="button" aria-label="확대" title="확대"
            onClick={() => setVt((v) => zoomAt(v, 2, W / 2, H / 2, W / 2, H / 2))}><PlusIcon /></button>
          <button type="button" aria-label="축소" title="축소"
            onClick={() => setVt((v) => zoomAt(v, 0.5, W / 2, H / 2, W / 2, H / 2))}><MinusIcon /></button>
        </div>
        {/* 31n: "후보 모두 보기" resets to the same measured fit
          above (fitMapView with fitPad): clearing the zoom/pan
          re-frames every pin inside the chrome-free rectangle. */}
        <button type="button" className="ui-float" aria-label="후보 모두 보기"
          title="후보 모두 보기"
          onClick={() => setVt({ zoom: 1, panX: 0, panY: 0 })}><FitIcon /></button>
        <div className="ui-float ui-chatmap-credit is-desktop" data-no-i18n>
          {creditFull}
        </div>
      </div>
      {/* 31m: the phone credit (≤ 480 px, CSS shows it) — one short
        line bottom-left, clear of the tray. A tap expands the full
        text above it; a second tap hides it. Desktop keeps the full
        text in the side column. Hidden while a pin card is docked. */}
      <div className="ui-float ui-chatmap-credit is-phone"
        hidden={!!(selectedId && W <= 480) || undefined}>
        {creditOpen && (
          <div className="ui-chatmap-credit-full" data-no-i18n>{creditFull}</div>
        )}
        <button type="button" className="ui-chatmap-credit-btn"
          aria-expanded={creditOpen}
          onClick={() => setCreditOpen((v) => !v)}>
          <span data-no-i18n>{creditShort}</span>
        </button>
      </div>
    </div>
  );
}
