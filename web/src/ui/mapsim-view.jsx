// 2D map simulation view (13, Part 8): the same engine and day
// strip, rendered on a flat map with the route on the walk graph +
// the subway line. SVG only (SSR-safe), no new dependency.
import { Text } from "@astryxdesign/core/Text";
import { fitRouteViewport } from "../mapsim.js";

export function MapSimView({ home, walkPath, nodeCoords, subwayStops, stationCoords, dayLabel }) {
  const walk = (walkPath || [])
    .map((id) => nodeCoords && nodeCoords[id])
    .filter((c) => Array.isArray(c));
  const sub = (subwayStops || [])
    .map((s) => stationCoords && stationCoords[s])
    .filter((c) => Array.isArray(c));
  const pts = [...walk.map(([lon, lat]) => ({ lon, lat })),
    ...sub.map(([lon, lat]) => ({ lon, lat }))];
  const vp = fitRouteViewport(pts, home);
  if (!vp) {
    return <Text type="supporting">경로를 그릴 위치가 없어요. 후보 목록은 그대로 볼 수 있어요.</Text>;
  }
  const W = 640;
  const H = 400;
  const px = (lon) => ((lon - vp.minLon) / (vp.maxLon - vp.minLon)) * (W - 40) + 20;
  const py = (lat) => H - (((lat - vp.minLat) / (vp.maxLat - vp.minLat)) * (H - 40) + 20);
  const walkD = walk.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(" ");
  const subD = sub.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(" ");
  return (
    <div className="ui-mapsim" aria-label={`지도 시뮬레이션${dayLabel ? ` ${dayLabel}` : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <rect x="0" y="0" width={W} height={H} fill="#eef1ea" />
        {subD && <path d={subD} fill="none" stroke="#4a7ba7" strokeWidth="3" strokeDasharray="7 4" />}
        {walkD && <path d={walkD} fill="none" stroke="#b25a33" strokeWidth="3" />}
        {home && Number.isFinite(home.lon) && (
          <g>
            <circle cx={px(home.lon)} cy={py(home.lat)} r="7" fill="#2f9e44" stroke="#fff" strokeWidth="2" />
            <text x={px(home.lon) + 10} y={py(home.lat) + 4} fontSize="13" fill="#23211d">
              {`집 · ${home.name || ""}`}
            </text>
          </g>
        )}
        {(subwayStops || []).map((s, i) => {
          const c = stationCoords && stationCoords[s];
          if (!c) return null;
          return (
            <g key={`${s}-${i}`}>
              <circle cx={px(c[0])} cy={py(c[1])} r="4" fill="#4a7ba7" stroke="#fff" strokeWidth="1.5" />
              <text x={px(c[0]) + 7} y={py(c[1]) - 6} fontSize="11" fill="#3d3227">{s}</text>
            </g>
          );
        })}
        <g fontSize="12" fill="#3d3227">
          <circle cx="24" cy="22" r="4" fill="#b25a33" />
          <text x="34" y="26">걷기</text>
          <circle cx="90" cy="22" r="4" fill="#4a7ba7" />
          <text x="100" y="26">지하철</text>
        </g>
      </svg>
    </div>
  );
}
