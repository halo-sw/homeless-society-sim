// Chat stage map (18, part 4): a painted SVG answering "where are my
// candidates, and how far from work". Top-down, static (no drift;
// nothing moves except on interaction), filling its panel. Hovering a
// card highlights its pin (cardHi) and hovering a pin highlights its
// card back; clicking a pin scrolls to its card; clicking a region
// still filters. SSR renders the container only.
import { useEffect, useRef, useState } from "react";
import { fitMapView, layoutPinLabels, MAP_COLORS, MAP_FIT_MARGIN } from "../chatmap.js";
import { tenurePriceLine } from "./candidate-card.jsx";

function ptsAttr(pts, toXY) {
  return pts.map(([lon, lat]) => {
    const [x, y] = toXY(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function pinPrice(candidate, tenure) {
  try {
    const t = (candidate.tenures || []).find((x) => x.tenure === tenure)
      || (candidate.tenures || [])[0] || null;
    if (!t || t.median_won === null || t.median_won === undefined) return "가격 미정";
    return tenurePriceLine(candidate, (t && t.tenure) || tenure).price;
  } catch {
    return "가격 미정";
  }
}

export function ChatMap({ map, cardHi, onPinHover, onPinClick, onRegion }) {
  const mountRef = useRef(null);
  const [size, setSize] = useState(null);
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
  const { toXY } = fitMapView(focus, W, H, MAP_FIT_MARGIN);
  // Constant screen sizes: one viewBox unit is one stage px at 1:1, so
  // literal px values stay readable however the map is zoomed.
  const fs = (n) => n;
  const green = m.green || {};
  return (
    <div ref={mountRef} className="ui-chatmap" style={{ width: "100%", height: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
        role="img" aria-label="후보 지도: 출근지와 후보 집 위치" preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={W} height={H} fill={MAP_COLORS.ground} />
        {(green.parks || []).map((ring, i) => (
          <polygon key={`pk${i}`} points={ptsAttr(ring, toXY)} fill={MAP_COLORS.park} />
        ))}
        {(green.water || []).map((ring, i) => (
          <polygon key={`gw${i}`} points={ptsAttr(ring, toXY)} fill={MAP_COLORS.water} />
        ))}
        {(m.tileWater || []).map((wseg, i) => (wseg.closed ? (
          <polygon key={`tw${i}`} points={ptsAttr(wseg.pts, toXY)}
            fill={MAP_COLORS.water} opacity={0.9}>
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polygon>
        ) : (
          <polyline key={`tw${i}`} points={ptsAttr(wseg.pts, toXY)} fill="none"
            stroke={MAP_COLORS.water} strokeWidth={fs(5)} strokeLinecap="round" opacity={0.9}>
            {wseg.name ? <title>{wseg.name}</title> : null}
          </polyline>
        )))}
        {regions.map((r) => {
          if (!Array.isArray(r.bbox)) return null;
          const [ax, ay] = toXY(r.bbox[0], r.bbox[3]);
          const [bx, by] = toXY(r.bbox[2], r.bbox[1]);
          return (
            <g key={r.id} onClick={() => onRegion && onRegion(r.id)}
              style={{ cursor: onRegion ? "pointer" : "default" }}>
              <rect x={Math.min(ax, bx)} y={Math.min(ay, by)}
                width={Math.abs(bx - ax)} height={Math.abs(by - ay)}
                fill="none" stroke={MAP_COLORS.regionLine} strokeWidth={fs(1.2)} />
              <text x={(ax + bx) / 2} y={(ay + by) / 2}
                fontSize={fs(11)} fill={MAP_COLORS.boundary} textAnchor="middle">
                {r.label}
              </text>
            </g>
          );
        })}
        {(m.tileBounds || []).map((b, i) => (
          <polyline key={`tb${i}`} points={ptsAttr(b.pts, toXY)} fill="none"
            stroke={MAP_COLORS.boundary} strokeWidth={fs(1)} opacity={0.8}>
            {b.name ? <title>{b.name}</title> : null}
          </polyline>
        ))}
        {(m.lines || []).map((l, i) => (
          <polyline key={`${l.id}:${l.direction || ""}:${i}`} points={ptsAttr(l.pts, toXY)} fill="none"
            stroke={l.color} strokeWidth={fs(2)} opacity={0.85}>
            <title>{l.name}</title>
          </polyline>
        ))}
        {(m.stations || []).map((s, i) => {
          const [x, y] = toXY(s.lon, s.lat);
          return (
            <circle key={`${s.line}${i}`} cx={x} cy={y} r={fs(2.4)}
              fill="#ffffff" stroke={MAP_COLORS.stationDot} strokeWidth={fs(1)}>
              <title>{s.name}</title>
            </circle>
          );
        })}
        {(m.commutes || []).flatMap((c) => c.legs.map((leg, i) => (
          <polyline key={`${c.pinId}${i}`} points={ptsAttr(leg.pts, toXY)} fill="none"
            stroke={leg.color} strokeWidth={fs(3.5)} strokeLinecap="round">
            <title>{`${c.label} 출근길`}</title>
          </polyline>
        )))}
        {(m.commutes || []).map((c) => {
          const leg = c.legs[0];
          if (!leg) return null;
          const mid = leg.pts[Math.floor(leg.pts.length / 2)];
          const [x, y] = toXY(mid[0], mid[1]);
          const label = c.minutes !== null && c.minutes !== undefined ? `${c.minutes}분` : "";
          if (!label) return null;
          return (
            <g key={`cm${c.pinId}`}>
              <rect x={x - fs(20)} y={y - fs(22)} width={fs(40)} height={fs(15)} rx={fs(4)}
                fill="#ffffff" opacity={0.92} />
              <text x={x} y={y - fs(10)} fontSize={fs(11)} textAnchor="middle"
                fill={MAP_COLORS.pinFill}>{label}</text>
            </g>
          );
        })}
        {m.workPin && (() => {
          const [x, y] = toXY(m.workPin.lon, m.workPin.lat);
          return (
            <g key="work">
              <circle cx={x} cy={y} r={fs(9)} fill={MAP_COLORS.workPin} />
              <text x={x} y={y + fs(4.5)} fontSize={fs(11)} textAnchor="middle" fill="#ffffff">직</text>
              <text x={x} y={y - fs(12)} fontSize={fs(11)} textAnchor="middle"
                fill={MAP_COLORS.pinFill}>{`직장 · ${m.workPin.name}`}</text>
            </g>
          );
        })()}
        {(() => {
          const laid = layoutPinLabels(pins.map((p) => {
            const [x, y] = toXY(p.lon, p.lat);
            return { id: p.id, x, y, tag: pinPrice(p.candidate, m.tenure) };
          }), W, H);
          const byId = new Map(laid.map((l) => [l.id, l]));
          return pins.map((p) => {
            const l = byId.get(p.id);
            const [tx0, ty0] = toXY(p.lon, p.lat);
            const x = l ? l.x : tx0;
            const y = l ? l.y : ty0;
            const hi = cardHi === `home:${p.id}`;
            const tag = pinPrice(p.candidate, m.tenure);
            const box = l ? l.box : null;
            return (
              <g key={p.id}
                onMouseEnter={() => onPinHover && onPinHover(`home:${p.id}`)}
                onMouseLeave={() => onPinHover && onPinHover(null)}
                onClick={() => onPinClick && onPinClick(p.id)}
                style={{ cursor: onPinClick ? "pointer" : "default" }}>
                {l && l.pinLeader && (
                  <line x1={l.pinLeader[0]} y1={l.pinLeader[1]} x2={x} y2={y}
                    stroke={MAP_COLORS.boundary} strokeWidth={fs(1)} opacity={0.8} />
                )}
                {hi && <circle cx={x} cy={y} r={fs(17)} fill="none"
                  stroke={MAP_COLORS.pinHi} strokeWidth={fs(2.5)} />}
                {p.picked && <circle cx={x} cy={y} r={fs(14)} fill="none"
                  stroke={MAP_COLORS.pickedRing} strokeWidth={fs(2)} />}
                <circle cx={x} cy={y} r={fs(11)} fill={MAP_COLORS.pinFill} />
                <text x={x} y={y + fs(4.5)} fontSize={fs(11.5)} textAnchor="middle"
                  fill="#ffffff">{p.n}</text>
                {l && l.tagLeader && (
                  <line x1={x} y1={y} x2={l.tagLeader[0]} y2={l.tagLeader[1]}
                    stroke={MAP_COLORS.boundary} strokeWidth={fs(1)} opacity={0.8} />
                )}
                {box && (
                  <rect x={box.x} y={box.y} width={box.w} height={fs(15)} rx={fs(4)}
                    fill="#ffffff" opacity={0.94} />
                )}
                {box && (
                  <text x={l.tx} y={l.ty} fontSize={fs(11)} textAnchor="middle"
                    fill={MAP_COLORS.pinFill}>{tag}</text>
                )}
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}
