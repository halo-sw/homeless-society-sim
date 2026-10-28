// Decorative street life placement (pure, no three.js).
//
// placeStreetlife(roads, origin, opts) deterministically parks cars
// along drivable road edges, picks a few slow movers, and lines the
// larger roads with street lamps. Like trees and walkers this is CLEARLY
// DECORATIVE — the UI/attribution says 나무·인물은 장식용 모의 표시,
// and no analysis may use it. Same seed => same layout.

import { lonLatToXY } from "../frame.js";
import { isDrivableClass, roadWidth } from "../ground.js";
import { hashString } from "../palette.js";

export const MAX_CARS = 600;
export const MAX_MOVERS = 120;
export const MAX_LAMPS = 1200;
export const PARKED_SPACING_M = 14;
export const LAMP_SPACING_M = 35;
export const MOVER_SPEED_MPS = 7; // slow residential crawl

const LAMP_CLASSES = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "unclassified", "residential", "living_street", "service",
]);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Body colours: muted Korean street mix (white/silver/black + rare colour).
const CAR_COLORS = [0xf2f2f0, 0xd8d8d8, 0x2a2c30, 0x5a6e8c, 0x8c3a3a, 0x3d5a5a];
const CAR_WEIGHTS = [0.34, 0.28, 0.2, 0.08, 0.05, 0.05];

export function carColor(rngValue) {
  let acc = 0;
  for (let i = 0; i < CAR_WEIGHTS.length; i++) {
    acc += CAR_WEIGHTS[i];
    if (rngValue < acc) return CAR_COLORS[i];
  }
  return CAR_COLORS[0];
}

export function placeStreetlife(roads, origin, opts = {}) {
  const { seed = "street", maxCars = MAX_CARS, maxMovers = MAX_MOVERS, maxLamps = MAX_LAMPS } = opts;
  const rng = mulberry32(hashString(`streetlife:${seed}`));
  const cars = [];
  const movers = [];
  const lamps = [];

  for (const road of roads || []) {
    if (road.geometry.type !== "LineString" || road.area) continue;
    if (!isDrivableClass(road.highway)) continue;
    const hw = roadWidth(road.highway) / 2;
    const pts = road.geometry.coordinates.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    if (pts.length < 2) continue;

    // Parked cars along both edges on streets wide enough to park.
    if (hw >= 2.75) {
      for (let i = 0; i < pts.length - 1 && cars.length < maxCars; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 8) continue;
        const dx = (bx - ax) / len;
        const dy = (by - ay) / len;
        const nx = -dy;
        const ny = dx;
        const n = Math.floor(len / PARKED_SPACING_M);
        for (let k = 0; k < n && cars.length < maxCars; k++) {
          if (rng() < 0.45) continue; // gaps in the parking row
          const t = (k + 0.5 + (rng() - 0.5) * 0.4) / n;
          const side = rng() < 0.5 ? 1 : -1;
          const off = hw - 1.4;
          cars.push({
            x: ax + dx * len * t + nx * off * side,
            y: ay + dy * len * t + ny * off * side,
            angle: Math.atan2(dy, dx) + (side < 0 ? Math.PI : 0),
            color: carColor(rng()),
          });
        }
        // One slow mover per long segment (subset capped below).
        if (len > 60 && movers.length < maxMovers && rng() < 0.5) {
          const side = rng() < 0.5 ? 1 : -1;
          const off = Math.max(0.8, hw / 2 - 0.6);
          movers.push({
            ax: ax + nx * off * side, ay: ay + ny * off * side,
            bx: bx + nx * off * side, by: by + ny * off * side,
            t: rng(), speed: MOVER_SPEED_MPS * (0.7 + rng() * 0.6),
            angle: Math.atan2(dy, dx) + (side < 0 ? Math.PI : 0),
            color: carColor(rng()),
          });
        }
      }
    }

    // Street lamps along the larger roads, alternating sides.
    if (LAMP_CLASSES.has(road.highway) || (road.highway || "").endsWith("_link")) {
      for (let i = 0; i < pts.length - 1 && lamps.length < maxLamps; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 10) continue;
        const dx = (bx - ax) / len;
        const dy = (by - ay) / len;
        const n = Math.max(1, Math.floor(len / LAMP_SPACING_M));
        for (let k = 0; k < n && lamps.length < maxLamps; k++) {
          const t = (k + 0.5) / n;
          const side = lamps.length % 2 === 0 ? 1 : -1;
          const off = hw + 1.5;
          lamps.push({
            x: ax + dx * len * t + -dy * off * side,
            y: ay + dy * len * t + dx * off * side,
            side,
          });
        }
      }
    }
  }
  return { cars, movers, lamps };
}

// Mover position at time t (seconds): ping-pong along its segment.
export function sampleMover(m, t) {
  const len = Math.hypot(m.bx - m.ax, m.by - m.ay) || 1;
  const period = (2 * len) / Math.max(0.1, m.speed);
  let ph = ((t / period + m.t) % 1 + 1) % 1;
  const k = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const flip = ph < 0.5 ? 0 : Math.PI;
  return {
    x: m.ax + (m.bx - m.ax) * k,
    y: m.ay + (m.by - m.ay) * k,
    angle: m.angle + flip,
  };
}
