import test from "node:test";
import assert from "node:assert/strict";
import {
  horizontal,
  project,
  precess,
  siderealDegrees,
  sunPosition,
} from "../src/sky/astronomy";

const ms = Date.UTC(2000, 0, 1, 12);
const near = (value: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(value - expected) < tolerance, `${value} vs ${expected}`);
test("sidereal reference and epoch precession preserve J2000 at its epoch", () => {
  near(siderealDegrees(ms, 0), 280.46061837, 0.000001);
  const p = precess(359.9, -30, ms);
  near(p.ra, 359.9);
  near(p.dec, -30);
});
test("zenith, horizon, cardinal direction and RA wrap across both hemispheres", () => {
  const r = siderealDegrees(ms, 0);
  near(
    horizontal(r, 0, { name: "Equator", latitude: 0, longitude: 0 }, ms, false)
      .altitude,
    90,
  );
  const east = horizontal(
    r + 90,
    0,
    { name: "Equator", latitude: 0, longitude: 0 },
    ms,
    false,
  );
  near(east.altitude, 0);
  near(east.azimuth, 90);
  const north = horizontal(
    0,
    90,
    { name: "North", latitude: 40, longitude: 0 },
    ms,
    false,
  );
  near(north.altitude, 40);
  near(north.azimuth, 0);
  const south = horizontal(
    0,
    -90,
    { name: "South", latitude: -40, longitude: 0 },
    ms,
    false,
  );
  near(south.altitude, 40);
  near(south.azimuth, 180);
  const a = horizontal(
    0,
    15,
    { name: "Wrap", latitude: 90, longitude: 179 },
    ms,
    false,
  );
  const b = horizontal(
    360,
    15,
    { name: "Wrap", latitude: 90, longitude: 179 },
    ms,
    false,
  );
  near(a.altitude, b.altitude);
  near(a.azimuth, b.azimuth);
  near(a.altitude, 15);
});
test("projection centers the requested direction and rejects the back hemisphere", () => {
  const camera = { azimuth: 359, altitude: 40, fov: 80 };
  const center = project({ azimuth: 359, altitude: 40 }, camera, 1200, 800)!;
  near(center.x, 600);
  near(center.y, 400);
  assert.equal(center.visible, true);
  assert.equal(
    project({ azimuth: 179, altitude: -40 }, camera, 1200, 800),
    null,
  );
  const right = project({ azimuth: 1, altitude: 40 }, camera, 1200, 800)!;
  assert.ok(right.x > 600);
  assert.ok(
    project({ azimuth: 1, altitude: 40 }, { ...camera, fov: 40 }, 1200, 800)!
      .x > right.x,
  );
});
test("live solar approximation identifies noon and midnight at Greenwich equinox", () => {
  const o = { name: "Greenwich", latitude: 51.4779, longitude: 0 };
  assert.ok(sunPosition(o, Date.UTC(2026, 2, 20, 12)).altitude > 37);
  assert.ok(sunPosition(o, Date.UTC(2026, 2, 20, 0)).altitude < -37);
});
