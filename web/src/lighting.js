// Solar position (pure, no three.js): standard NOAA-style approximation.
//
// solarPosition(lat, lon, date) -> {altitude, azimuth} in degrees, where
// date is an absolute instant (e.g. new Date("2026-06-21T12:30:00+09:00")
// for 12:30 KST). No timezone parameter is needed: true solar time is
// UTC minutes + 4 min/deg of longitude + equation of time. Azimuth is
// measured from north, eastward (0 = N, 90 = E). sunDirection returns a
// unit [x, y, z] in three.js world space (x east, y up, z = -north, so a
// sun in the south has +z). main.js aims the directional light from this.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function solarPosition(lat, lon, date) {
  // Fractional year (day of year with time of day, UTC).
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (date.getTime() - start) / 86400000 + 1;
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);
  // Equation of time (minutes) + declination (radians).
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  // True solar time (minutes): UTC + longitude + equation of time.
  const utcMin =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = utcMin + lon * 4 + eqtime;
  const ha = (((tst / 4 - 180 + 540) % 360) - 180) * RAD; // hour angle
  const latR = lat * RAD;
  const cosZen =
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const altitude = 90 - zen * DEG;
  // Azimuth from north, eastward.
  const sinAz = (-Math.sin(ha) * Math.cos(decl)) / Math.sin(zen);
  let az = Math.acos(Math.min(1, Math.max(-1, sinAz))) * DEG;
  if (Math.sin(ha) > 0) az = 360 - az;
  return { altitude, azimuth: ((az % 360) + 360) % 360 };
}

export function sunDirection(lat, lon, date) {
  const { altitude, azimuth } = solarPosition(lat, lon, date);
  const altR = altitude * RAD;
  const azR = azimuth * RAD;
  // East = sin(az)*cos(alt); up = sin(alt); north-component = cos(az)*cos(alt).
  // Three.js world: x = east, y = up, z = -north.
  const x = Math.sin(azR) * Math.cos(altR);
  const y = Math.sin(altR);
  const z = -Math.cos(azR) * Math.cos(altR);
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
