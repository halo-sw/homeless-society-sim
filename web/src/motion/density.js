// Diurnal density curves (pure, no three.js).
//
// How many movers are out at each hour: rush-hour peaks, night
// trough. These shapes are 가정값 (assumed, not observed traffic) —
// the only observed scaling is the station-congestion factor applied
// to near-station pedestrians (see pedestrians.js, labelled 실측).
// Values are 0..1 multipliers on each road's full slot count.

export const DENSITY_SOURCE = "가정값";

// 24 hourly nodes, index = hour of day. Rush peaks at 08 and 18–19,
// trough 02–04.
export const VEHICLE_CURVE = {
  label: "시간대별 차량 밀도",
  source: DENSITY_SOURCE,
  hourly: [
    0.06, 0.04, 0.03, 0.03, 0.04, 0.08, // 00–05
    0.25, 0.55, 0.95, 0.70, 0.50, 0.55, // 06–11
    0.55, 0.50, 0.50, 0.55, 0.65, 0.85, // 12–17
    1.00, 0.80, 0.55, 0.35, 0.20, 0.10, // 18–23
  ],
};

export const PED_CURVE = {
  label: "시간대별 보행자 밀도",
  source: DENSITY_SOURCE,
  hourly: [
    0.03, 0.02, 0.01, 0.01, 0.02, 0.06, // 00–05
    0.20, 0.60, 1.00, 0.65, 0.50, 0.60, // 06–11
    0.65, 0.55, 0.50, 0.55, 0.70, 0.90, // 12–17
    1.00, 0.75, 0.45, 0.25, 0.12, 0.06, // 18–23
  ],
};

// Linear interpolation between hourly nodes; minute wraps past 24 h
// (multi-day sim time stays continuous).
export function factorAt(curve, minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const f = (m - h * 60) / 60;
  const a = curve.hourly[h];
  const b = curve.hourly[(h + 1) % 24];
  return a + (b - a) * f;
}

// Active movers of `slots` at `minute`, capped.
export function activeCount(slots, curve, minute, cap = Infinity) {
  return Math.min(cap, Math.round(slots * factorAt(curve, minute)));
}
