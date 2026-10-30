// Chat stage map (19b): a calm, light product basemap — land, parks,
// water, road casings, subway lines with nearby stations, commute legs
// for picked homes, region names (text only), a dark workplace pill and
// one price pill per candidate (letters for picks). Top-down, static
// (nothing moves except on interaction), filling its panel. Hovering a
// card highlights its pin (cardHi) and hovering a pin highlights its
// card back; clicking a pin scrolls to its card; clicking a region
// still filters. SSR renders the container only.
import { useEffect, useRef, useState } from "react";
import { fitMapView, layoutMapPills, layoutStationLabels, pickDongLabels,
  stationNameWidthPx, haversineKm, shortPinPrice,
  pinPillWidthPx, MAP_COLORS, MAP_FIT_MARGIN } from "../chatmap.js";

function ptsAttr(pts, toXY) {
  return pts.map(([lon, lat]) => {
    const [x, y] = toXY(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

// 19a reserves a context pill (top 56 px) and a picks tray (bottom
// 96 px); the fit keeps every pin anchor inside the free rectangle.
const CHATMAP_INSET = { top: 56, right: 24, bottom: 96, left: 24 };
const PILL_H = 24;
const PILL_TAIL = 5;

const noSpace = (s) => String(s || "").replace(/\s+/g, "");

function pillTextWidthPx(text, px) {
  let tw = 0;
  for (const ch of String(text || "")) tw += ch.codePointAt(0) > 0xff ? px : Math.round(px * 0.58);
  return tw;
}

export function ChatMap({ map, cardHi, onPinHover, onPinClick, onRegion }) {
  const mountRef = useRef(null);
  const [size, setSize] = useState(null);
  const [expanded, setExpanded] = useState(null);
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
  // One projected space: fitMapView maps lon/lat into stage px via
  // toXY, and the viewBox IS that stage (0 0 W H) — never the raw
  // degree view. Every layer below draws through toXY, so pins, lines
  // and labels always land inside the frame.
  const { toXY } = fitMapView(focus, W, H, MAP_FIT_MARGIN, CHATMAP_INSET);
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
    const [x, y] = toXY(m.workPin.lon, m.workPin.lat);
    const label = `회사 · ${m.workPin.name}`;
    pillItems.push({ id: "work", kind: "work", x, y,
      w: pillTextWidthPx(label, 12) + 24, h: 26, rank: 0 });
  }
  for (const p of pins) {
    const [x, y] = toXY(p.lon, p.lat);
    const short = shortPinPrice(p.candidate, m.tenure);
    pillItems.push({ id: p.id, kind: "pill", x, y,
      w: pinPillWidthPx(short), h: PILL_H, rank: p.picked ? 1 : 2 });
  }
  const laid = layoutMapPills(pillItems, W, H);
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
  for (const s of nearStations) {
    const key = noSpace(s.name);
    if (seenStation.has(key)) continue;
    seenStation.add(key);
    const [x, y] = toXY(s.lon, s.lat);
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
        const [x, y] = toXY(d.lon, d.lat);
        return { name: d.text, x, y };
      }),
    W, H, [...pinBoxes, ...stationLabelBoxes]);
  // The hovered pin renders last so it sits on top.
  const ordered = [...pins].sort((a, b) =>
    ((cardHi === `home:${a.id}`) ? 1 : 0) - ((cardHi === `home:${b.id}`) ? 1 : 0));
  return (
    <div ref={mountRef} className="ui-chatmap" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
        role="img" aria-label="후보 지도: 출근지와 후보 집 위치" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="chat-pill-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={1} stdDeviation={2}
              floodColor="#000000" floodOpacity={0.25} />
          </filter>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={MAP_COLORS.ground} />
        {(green.parks || []).map((ring, i) => (
          <polygon key={`pk${i}`} points={ptsAttr(ring, toXY)} fill={MAP_COLORS.park} />
        ))}
        {(green.water || []).map((ring, i) => (
          <polygon key={`gw${i}`} points={ptsAttr(ring, toXY)} fill={MAP_COLORS.water} />
        ))}
        {(m.tileWater || []).map((wseg, i) => (wseg.closed ? (
          <polygon key={`tw${i}`} points={ptsAttr(wseg.pts, toXY)}
            fill={MAP_COLORS.water}>
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polygon>
        ) : (
          <polyline key={`tw${i}`} points={ptsAttr(wseg.pts, toXY)} fill="none"
            stroke={MAP_COLORS.water} strokeWidth={fs(3)}
            strokeLinecap="round" strokeLinejoin="round">
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polyline>
        )))}
        {(m.roads || []).filter((r) => r.cls === "trunk").map((r, i) => (
          <polyline key={`rdct${i}`} points={ptsAttr(r.pts, toXY)} fill="none"
            stroke={MAP_COLORS.roadCasing} strokeWidth={fs(7)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls !== "trunk").map((r, i) => (
          <polyline key={`rdcp${i}`} points={ptsAttr(r.pts, toXY)} fill="none"
            stroke={MAP_COLORS.roadCasing} strokeWidth={fs(5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls === "trunk").map((r, i) => (
          <polyline key={`rdt${i}`} points={ptsAttr(r.pts, toXY)} fill="none"
            stroke={MAP_COLORS.road} strokeWidth={fs(5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.roads || []).filter((r) => r.cls !== "trunk").map((r, i) => (
          <polyline key={`rdp${i}`} points={ptsAttr(r.pts, toXY)} fill="none"
            stroke={MAP_COLORS.road} strokeWidth={fs(3.5)}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(m.lines || []).map((l, i) => (
          <polyline key={`casing:${l.id}:${l.direction || ""}:${i}`} points={ptsAttr(l.pts, toXY)} fill="none"
            stroke="#ffffff" strokeWidth={fs(5)}
            strokeLinejoin="round" strokeLinecap="round">
            <title>{l.name}</title>
          </polyline>
        ))}
        {(m.lines || []).map((l, i) => (
          <polyline key={`${l.id}:${l.direction || ""}:${i}`} points={ptsAttr(l.pts, toXY)} fill="none"
            stroke={l.color} strokeWidth={fs(3)}
            strokeLinejoin="round" strokeLinecap="round" opacity={1}>
            <title>{l.name}</title>
          </polyline>
        ))}
        {nearStations.map((s, i) => {
          const [x, y] = toXY(s.lon, s.lat);
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
            fill={MAP_COLORS.muted}>{l.name}</text>
        ))}
        {dongPlaced.map((l, i) => (
          <text key={`dong${i}`} data-layer="dong-label"
            x={l.x + stationNameWidthPx(l.name) / 2} y={l.y} fontSize={fs(12)}
            fontWeight={500} textAnchor="middle"
            fill={MAP_COLORS.regionLabel}>{l.name}</text>
        ))}
        {(m.commutes || []).flatMap((c) => c.legs.flatMap((leg, i) => [
          <polyline key={`${c.pinId}c${i}`} points={ptsAttr(leg.pts, toXY)} fill="none"
            stroke="#ffffff" strokeWidth={fs(7)}
            strokeLinejoin="round" strokeLinecap="round" />,
          <polyline key={`${c.pinId}${i}`} points={ptsAttr(leg.pts, toXY)} fill="none"
            stroke={leg.color} strokeWidth={fs(4)}
            strokeLinejoin="round" strokeLinecap="round">
            <title>{`${c.label} 출근길`}</title>
          </polyline>,
        ]))}
        {(m.commutes || []).map((c) => {
          const leg = c.legs[0];
          if (!leg || c.minutes === null || c.minutes === undefined) return null;
          const mid = leg.pts[Math.floor(leg.pts.length / 2)];
          const [x, y] = toXY(mid[0], mid[1]);
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
          const [cx, cy] = toXY((r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2);
          // 19h: centred pills can cover the label spot — try offsets
          // before skipping; skip only if every spot collides.
          const spot = [[0, 0], [0, 28], [0, -28], [60, 0], [-60, 0]]
            .map(([dx, dy]) => [cx + dx, cy + dy])
            .find(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H && !hitsPinBox(x, y));
          if (!spot) return null;
          const [x, y] = spot;
          return (
            <text key={r.id} data-layer="region-label" x={x} y={y}
              fontSize={fs(12)} fontWeight={500} letterSpacing="0.02em"
              fill={MAP_COLORS.regionLabel} textAnchor="middle"
              onClick={() => onRegion && onRegion(r.id)}
              style={{ cursor: onRegion ? "pointer" : "default" }}>
              {r.label}
            </text>
          );
        })}
        {(() => {
          const l = layById.get("work");
          if (!m.workPin || !l) return null;
          const [px, py] = toXY(m.workPin.lon, m.workPin.lat);
          const { box } = l;
          const label = `회사 · ${m.workPin.name}`;
          const cx = box.x + box.w / 2;
          return (
            <g key="work">
              {l.leader && (
                <line x1={l.leader[0]} y1={l.leader[1]} x2={px} y2={py}
                  stroke={MAP_COLORS.workPin} strokeWidth={fs(1.5)} />
              )}
              <g filter="url(#chat-pill-shadow)">
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2}
                  fill={MAP_COLORS.workPin} />
                <text x={cx} y={box.y + fs(17)} fontSize={fs(12)} fontWeight={600}
                  textAnchor="middle" fill="#ffffff">{label}</text>
              </g>
              {!l.leader && (
                <polygon points={`${cx - fs(5)},${box.y + box.h} ${cx + fs(5)},${box.y + box.h} ${px},${py}`}
                  fill={MAP_COLORS.workPin} />
              )}
            </g>
          );
        })()}
        {ordered.map((p) => {
          if (clustered.has(p.id)) return null;
          const l = layById.get(p.id);
          const [px, py] = toXY(p.lon, p.lat);
          const short = shortPinPrice(p.candidate, m.tenure);
          const pw = pinPillWidthPx(short);
          const box = (l && l.box) || { x: px - pw / 2, y: py - fs(12) - PILL_H, w: pw, h: PILL_H };
          const hi = cardHi === `home:${p.id}`;
          const picked = !!p.picked;
          const fill = picked ? MAP_COLORS.pinPicked : MAP_COLORS.pinFill;
          const glyph = picked ? (p.letter || String(p.n)) : String(p.n);
          const dotFill = picked ? "#ffffff" : MAP_COLORS.pinText;
          const dotText = picked ? MAP_COLORS.pinPicked : "#ffffff";
          const mainText = picked ? "#ffffff" : MAP_COLORS.pinText;
          const dcx = box.x + fs(8 + 8);
          const dcy = box.y + PILL_H / 2;
          const txx = box.x + fs(8 + 16 + 6);
          const tailX = box.x + box.w / 2;
          const tailTipX = tailX;
          const tailTipY = box.y + PILL_H + PILL_TAIL;
          const needLeader = Math.hypot(tailTipX - px, tailTipY - py) > 8;
          const zoom = hi
            ? `translate(${tailTipX} ${tailTipY}) scale(1.08) translate(${-tailTipX} ${-tailTipY})` : undefined;
          return (
            <g key={p.id}
              onMouseEnter={() => onPinHover && onPinHover(`home:${p.id}`)}
              onMouseLeave={() => onPinHover && onPinHover(null)}
              onClick={() => onPinClick && onPinClick(p.id)}
              style={{ cursor: onPinClick ? "pointer" : "default" }}>
              {needLeader && (
                <line x1={tailTipX} y1={tailTipY} x2={px} y2={py}
                  stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
              )}
              <circle cx={px} cy={py} r={fs(4)} fill={MAP_COLORS.pinText} />
              <g transform={zoom}>
                <g filter="url(#chat-pill-shadow)">
                  <rect x={box.x} y={box.y} width={box.w} height={fs(PILL_H)} rx={fs(999)}
                    fill={fill} stroke={picked ? "none" : "#e2ddd3"} strokeWidth={fs(1)} />
                  <circle cx={dcx} cy={dcy} r={fs(8)} fill={dotFill} />
                  <text x={dcx} y={dcy + fs(3.5)} fontSize={fs(10)} textAnchor="middle"
                    fill={dotText}>{glyph}</text>
                  <text x={txx} y={box.y + fs(16)} fontSize={fs(12)} fontWeight={600}
                    fill={mainText}>{short}</text>
                </g>
                <polygon points={`${tailX - fs(4)},${box.y + PILL_H} ${tailX + fs(4)},${box.y + PILL_H} ${tailTipX},${tailTipY}`}
                  fill={fill} />
              </g>
            </g>
          );
        })}
        {laid.filter((l) => l.kind === "cluster").map((l) => {
          const open = expanded === l.id;
          const cx = l.box.x + l.box.w / 2;
          return (
            <g key={l.id} onClick={() => setExpanded(open ? null : l.id)}
              style={{ cursor: "pointer" }}>
              {l.leader && (
                <line x1={l.leader[0]} y1={l.leader[1]} x2={l.x} y2={l.y}
                  stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
              )}
              <g filter="url(#chat-pill-shadow)">
                <rect x={l.box.x} y={l.box.y} width={l.box.w} height={fs(l.box.h)} rx={fs(999)}
                  fill="#ffffff" stroke={MAP_COLORS.pinHi} strokeWidth={fs(1.5)} />
                <text x={cx} y={l.box.y + fs(16)} fontSize={fs(12)} fontWeight={700}
                  textAnchor="middle" fill={MAP_COLORS.pinHi}>{`+${l.count}`}</text>
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
            const short = shortPinPrice(pin.candidate, m.tenure);
            const pw = pinPillWidthPx(short);
            const R = Math.max(48, 18 * arr.length);
            const ang = (-Math.PI / 2) + ((i + 0.5) * 2 * Math.PI) / arr.length;
            const bx = cluster.box.x + cluster.box.w / 2 + R * Math.cos(ang) - pw / 2;
            const by = cluster.box.y + cluster.box.h / 2 + R * Math.sin(ang) - PILL_H / 2;
            const [px, py] = toXY(pin.lon, pin.lat);
            return (
              <g key={`open-${mb.id}`}
                onMouseEnter={() => onPinHover && onPinHover(`home:${pin.id}`)}
                onMouseLeave={() => onPinHover && onPinHover(null)}
                onClick={() => onPinClick && onPinClick(pin.id)}
                style={{ cursor: onPinClick ? "pointer" : "default" }}>
                <line x1={bx + pw / 2} y1={by + PILL_H} x2={px} y2={py}
                  stroke={MAP_COLORS.muted} strokeWidth={fs(1)} />
                <circle cx={px} cy={py} r={fs(4)} fill={MAP_COLORS.pinText} />
                <g filter="url(#chat-pill-shadow)">
                  <rect x={bx} y={by} width={pw} height={fs(PILL_H)} rx={fs(999)}
                    fill={MAP_COLORS.pinFill} stroke="#e2ddd3" strokeWidth={fs(1)} />
                  <circle cx={bx + fs(16)} cy={by + PILL_H / 2} r={fs(8)} fill={MAP_COLORS.pinText} />
                  <text x={bx + fs(16)} y={by + PILL_H / 2 + fs(3.5)} fontSize={fs(10)}
                    textAnchor="middle" fill="#ffffff">{pin.n}</text>
                  <text x={bx + fs(30)} y={by + fs(16)} fontSize={fs(12)} fontWeight={600}
                    fill={MAP_COLORS.pinText}>{short}</text>
                </g>
              </g>
            );
          })}
      </svg>
      <div style={{ position: "absolute", top: 12, right: 12, background: "#ffffff",
        borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#55514a" }}>
        ● 후보 · ■ 회사 · ━ 지하철 · 숫자는 출근 편도(추정)
      </div>
      <div style={{ position: "absolute", right: 8, bottom: 8, fontSize: 10,
        color: MAP_COLORS.muted }}>
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
