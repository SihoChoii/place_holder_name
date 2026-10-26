import type { SkyStar } from "@/lib/catalog";
import { isFresh, publicSnapshot } from "@/lib/api/public-star";
import {
  clamp,
  precess,
  RAD,
  siderealDegrees,
  sunPosition,
  type Camera,
  type Observer,
} from "./astronomy";

export type Pick = {
  star: SkyStar;
  x: number;
  y: number;
  altitude: number;
  azimuth: number;
};
export interface SkyOptions {
  observer: Observer;
  camera: Camera;
  selected: number | null;
  names: boolean;
}

/** Canvas points and hit targets share one projected list; all distances are CSS pixels. */
export function createSky(
  canvas: HTMLCanvasElement,
  stars: SkyStar[],
  options: SkyOptions,
  onDraw: (visible: Pick[], width: number, height: number) => void,
) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context)
    throw new Error(
      "This browser cannot draw the sky. The full catalog is still available.",
    );
  const ctx = context;
  let current = options,
    width = 1,
    height = 1,
    dpr = 1,
    dirty = true,
    frame = 0,
    last = 0,
    disposed = false;
  let projected: Pick[] = [];
  const style = getComputedStyle(canvas);
  const colors = {
    background: style.getPropertyValue("--background").trim(),
    foreground: style.getPropertyValue("--foreground").trim(),
    muted: style.getPropertyValue("--muted-foreground").trim(),
    day: style.getPropertyValue("--sky-day").trim(),
    twilight: style.getPropertyValue("--sky-twilight").trim(),
  };
  const epoch = Date.now();
  const vectors = stars.map((star) => {
    const p = precess(star.raDegrees, star.decDegrees, epoch),
      r = p.ra * RAD,
      d = p.dec * RAD;
    return {
      star,
      x: Math.cos(d) * Math.cos(r),
      y: Math.cos(d) * Math.sin(r),
      z: Math.sin(d),
    };
  });
  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    dirty = true;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  function draw(now: number) {
    if (disposed || document.hidden) return;
    frame = requestAnimationFrame(draw);
    if (!dirty && now - last < 1000) return;
    paint(now);
  }
  function paint(now: number) {
    dirty = false;
    last = now;
    const ms = Date.now(),
      { observer, camera } = current;
    const sun = sunPosition(observer, ms);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle =
      sun.altitude >= 0
        ? colors.day
        : sun.altitude > -12
          ? colors.twilight
          : colors.background;
    ctx.fillRect(0, 0, width, height);
    const lat = observer.latitude * RAD,
      lst = siderealDegrees(ms, observer.longitude) * RAD;
    const sl = Math.sin(lst),
      cl = Math.cos(lst),
      sp = Math.sin(lat),
      cp = Math.cos(lat);
    const az = camera.azimuth * RAD,
      alt = camera.altitude * RAD,
      sa = Math.sin(az),
      ca = Math.cos(az),
      se = Math.sin(alt),
      ce = Math.cos(alt);
    const scale = width / (2 * Math.tan((camera.fov * RAD) / 2));
    // With zero camera roll, the geometric horizon is a horizontal line.
    const horizon = height / 2 + Math.tan(alt) * scale;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, clamp(horizon, 0, height), width, height);
    const limit =
      sun.altitude >= 0
        ? -2
        : sun.altitude > -18
          ? clamp(6.5 - (sun.altitude + 18) * 0.46, -2, 6.5)
          : 6.5;
    projected = [];
    let labels = 0;
    for (const v of vectors) {
      const star = v.star;
      if (star.magnitude > limit) continue;
      const equatorial = v.x * cl + v.y * sl;
      const east = -v.x * sl + v.y * cl,
        north = v.z * cp - equatorial * sp,
        up = v.z * sp + equatorial * cp;
      if (up <= 0) continue;
      const right = east * ca - north * sa,
        vertical = -east * se * sa - north * se * ca + up * ce,
        depth = east * ce * sa + north * ce * ca + up * se;
      if (depth <= 0.001) continue;
      const x = width / 2 + (right / depth) * scale,
        y = height / 2 - (vertical / depth) * scale;
      if (x < 0 || x > width || y < 0 || y > height) continue;
      const point = {
        star,
        x,
        y,
        altitude: Math.asin(up) / RAD,
        azimuth: (((Math.atan2(east, north) / RAD) % 360) + 360) % 360,
      };
      projected.push(point);
      const radius = clamp(2.4 - star.magnitude * 0.27, 0.55, 3.2);
      ctx.globalAlpha = clamp(1 - (star.magnitude + 1.5) * 0.065, 0.35, 1);
      // B–V color is scientific imagery. Missing B–V remains neutral white.
      ctx.fillStyle =
        star.colorIndex === null
          ? colors.foreground
          : star.colorIndex > 0.9
            ? "#ffd9ad"
            : star.colorIndex < 0.1
              ? "#d5e3ff"
              : colors.foreground;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const state = publicSnapshot(star.id);
      if (isFresh(state, ms)) {
        ctx.strokeStyle = colors.foreground;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        if (state.data!.star.claim) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (current.selected === star.id) {
        ctx.strokeStyle = colors.foreground;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 12, y - 12, 24, 24);
      }
      if (
        (current.names && labels < 22 && star.magnitude < 4) ||
        current.selected === star.id
      ) {
        ctx.font = "14px Inter Variable, sans-serif";
        ctx.fillStyle = colors.foreground;
        ctx.fillText(
          star.name,
          Math.min(x + 15, width - ctx.measureText(star.name).width - 8),
          Math.max(20, y - 10),
        );
        labels++;
      }
    }
    ctx.globalAlpha = 1;
    if (sun.altitude > 0) {
      const a = sun.azimuth * RAD,
        e = sun.altitude * RAD,
        ep = Math.cos(e) * Math.sin(a),
        np = Math.cos(e) * Math.cos(a),
        u = Math.sin(e);
      const depth = ep * ce * sa + np * ce * ca + u * se;
      if (depth > 0) {
        const x = width / 2 + ((ep * ca - np * sa) / depth) * scale,
          y =
            height / 2 -
            ((-ep * se * sa - np * se * ca + u * ce) / depth) * scale;
        ctx.fillStyle = "#fff3cc";
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          Math.max(3, scale * Math.tan(0.266 * RAD)),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    onDraw(projected, width, height);
  }
  function visibility() {
    cancelAnimationFrame(frame);
    if (!document.hidden) {
      dirty = true;
      frame = requestAnimationFrame(draw);
    }
  }
  document.addEventListener("visibilitychange", visibility);
  frame = requestAnimationFrame(draw);
  return {
    update(value: SkyOptions) {
      if (
        current.camera !== value.camera ||
        current.observer !== value.observer ||
        current.selected !== value.selected ||
        current.names !== value.names
      )
        dirty = true;
      current = value;
    },
    pick(x: number, y: number, radius = 14) {
      // Input can arrive between React's camera update and the next animation frame.
      // Flush that frame before hit testing so preview anchors match the drawn points.
      if (dirty) paint(performance.now());
      let nearest: Pick | null = null,
        distance = radius;
      for (const p of projected) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < distance) {
          nearest = p;
          distance = d;
        }
      }
      return nearest;
    },
    center() {
      return this.pick(width / 2, height / 2, Math.max(width, height));
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
