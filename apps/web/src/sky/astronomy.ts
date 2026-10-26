/** Geometric sky, no refraction or proper motion. J2000 precessed to mean equator of date.
 * Sidereal / horizontal / approximate solar formulae: US Naval Observatory FAQ.
 * Precession: IAU 1976, J2000 initial epoch (Meeus, Astronomical Algorithms ch. 21).
 */
export const RAD = Math.PI / 180;
export const wrap = (d: number) => ((d % 360) + 360) % 360;
export const clamp = (n: number, a: number, b: number) =>
  Math.min(b, Math.max(a, n));
export type Observer = { name: string; latitude: number; longitude: number };
export type Camera = { azimuth: number; altitude: number; fov: number };
export type Horizontal = { azimuth: number; altitude: number };
export function julianDate(ms: number) {
  return ms / 86400000 + 2440587.5;
}
export function siderealDegrees(ms: number, longitude: number) {
  const jd = julianDate(ms),
    d = jd - 2451545,
    t = d / 36525;
  return wrap(
    280.46061837 +
      360.98564736629 * d +
      0.000387933 * t * t -
      (t * t * t) / 38710000 +
      longitude,
  );
}
export function precess(ra: number, dec: number, ms: number) {
  const t = (julianDate(ms) - 2451545) / 36525;
  const zeta =
    ((2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) / 3600) * RAD;
  const z =
    ((2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) / 3600) * RAD;
  const theta =
    ((2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) / 3600) * RAD;
  const r = ra * RAD + zeta,
    d = dec * RAD;
  const a = Math.cos(d) * Math.sin(r);
  const b =
    Math.cos(theta) * Math.cos(d) * Math.cos(r) - Math.sin(theta) * Math.sin(d);
  const c =
    Math.sin(theta) * Math.cos(d) * Math.cos(r) + Math.cos(theta) * Math.sin(d);
  return {
    ra: wrap((Math.atan2(a, b) + z) / RAD),
    dec: Math.asin(clamp(c, -1, 1)) / RAD,
  };
}
export function horizontal(
  ra: number,
  dec: number,
  observer: Observer,
  ms: number,
  j2000 = true,
): Horizontal {
  const p = j2000 ? precess(ra, dec, ms) : { ra, dec };
  const h = (siderealDegrees(ms, observer.longitude) - p.ra) * RAD,
    d = p.dec * RAD,
    lat = observer.latitude * RAD;
  const east = -Math.cos(d) * Math.sin(h);
  const north =
    Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.cos(h) * Math.sin(lat);
  const up =
    Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(h) * Math.cos(lat);
  return {
    azimuth: wrap(Math.atan2(east, north) / RAD),
    altitude: Math.asin(clamp(up, -1, 1)) / RAD,
  };
}
export function sunPosition(observer: Observer, ms: number): Horizontal {
  const d = julianDate(ms) - 2451545,
    g = wrap(357.529 + 0.98560028 * d) * RAD;
  const l =
      (280.459 +
        0.98564736 * d +
        1.915 * Math.sin(g) +
        0.02 * Math.sin(2 * g)) *
      RAD,
    e = (23.439 - 0.00000036 * d) * RAD;
  return horizontal(
    wrap(Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) / RAD),
    Math.asin(Math.sin(e) * Math.sin(l)) / RAD,
    observer,
    ms,
    false,
  );
}
export function project(
  position: Horizontal,
  camera: Camera,
  width: number,
  height: number,
) {
  const a = position.azimuth * RAD,
    alt = position.altitude * RAD,
    ca = camera.azimuth * RAD,
    ce = camera.altitude * RAD;
  const east = Math.cos(alt) * Math.sin(a),
    north = Math.cos(alt) * Math.cos(a),
    up = Math.sin(alt);
  const right = east * Math.cos(ca) - north * Math.sin(ca);
  const vertical =
    -east * Math.sin(ce) * Math.sin(ca) -
    north * Math.sin(ce) * Math.cos(ca) +
    up * Math.cos(ce);
  const depth =
    east * Math.cos(ce) * Math.sin(ca) +
    north * Math.cos(ce) * Math.cos(ca) +
    up * Math.sin(ce);
  if (depth <= 0.001) return null;
  const scale = width / (2 * Math.tan((camera.fov * RAD) / 2));
  const x = width / 2 + (right / depth) * scale,
    y = height / 2 - (vertical / depth) * scale;
  return { x, y, visible: x >= 0 && x <= width && y >= 0 && y <= height };
}
export function skyPhase(altitude: number) {
  return altitude >= 0
    ? "Daylight"
    : altitude >= -6
      ? "Civil twilight"
      : altitude >= -12
        ? "Nautical twilight"
        : altitude >= -18
          ? "Astronomical twilight"
          : "Night";
}
