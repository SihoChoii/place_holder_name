"use client";
import { useEffect, useRef, useState } from "react";
import type { SkyStar } from "@/lib/catalog";
import { createSky, type Pick, type SkyOptions } from "./engine";
import { clamp, wrap, type Camera } from "./astronomy";

type Props = SkyOptions & {
  stars: SkyStar[];
  setCamera: (value: Camera) => void;
  onPick: (point: Pick | null, kind: "hover" | "select") => void;
  onVisible: (points: Pick[], aspect: number) => void;
  onReady: () => void;
};
export function SkyCanvas(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<ReturnType<typeof createSky> | null>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    camera: Camera;
    moved: boolean;
    distance: number;
  } | null>(null);
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredId = useRef<number | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    let ready = false;
    try {
      engine.current = createSky(
        canvas.current,
        props.stars,
        latest.current,
        (points, width, height) => {
          latest.current.onVisible(points, width / height);
          if (!ready) {
            ready = true;
            latest.current.onReady();
          }
        },
      );
    } catch (e) {
      setError((e as Error).message);
      latest.current.onReady();
    }
    const element = canvas.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = latest.current.camera;
      latest.current.setCamera({
        ...c,
        fov: clamp(c.fov * Math.exp(e.deltaY * 0.001), 20, 110),
      });
    };
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "Sky rendering was interrupted. Reload the page or open the catalog.",
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("contextlost", lost);
    return () => {
      engine.current?.dispose();
      engine.current = null;
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("contextlost", lost);
      if (hover.current) clearTimeout(hover.current);
    };
  }, [props.stars]);
  useEffect(() => {
    engine.current?.update(props);
  }, [props.camera, props.observer, props.selected, props.names]);
  useEffect(() => {
    if (hover.current) clearTimeout(hover.current);
    hoveredId.current = null;
  }, [props.camera, props.observer]);
  const local = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pickAt = (x: number, y: number, radius = 14) => {
    engine.current?.update(latest.current);
    return engine.current?.pick(x, y, radius) ?? null;
  };
  return (
    <>
      {error ? (
        <div className="sky-unavailable" role="alert">
          <p>{error}</p>
          <a href="/catalog">Open catalog</a>
        </div>
      ) : null}
      <canvas
        ref={canvas}
        className="sky-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Live sky over ${props.observer.name}`}
        aria-describedby="sky-instructions"
        data-testid="sky-canvas"
        onKeyDown={(e) => {
          const c = props.camera;
          let next: Camera | null = null;
          if (e.key === "ArrowLeft")
            next = { ...c, azimuth: wrap(c.azimuth - 5) };
          if (e.key === "ArrowRight")
            next = { ...c, azimuth: wrap(c.azimuth + 5) };
          if (e.key === "ArrowUp")
            next = { ...c, altitude: clamp(c.altitude + 5, -20, 85) };
          if (e.key === "ArrowDown")
            next = { ...c, altitude: clamp(c.altitude - 5, -20, 85) };
          if (e.key === "+" || e.key === "=")
            next = { ...c, fov: clamp(c.fov - 10, 20, 110) };
          if (e.key === "-") next = { ...c, fov: clamp(c.fov + 10, 20, 110) };
          if (next) {
            e.preventDefault();
            props.setCamera(next);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            engine.current?.update(latest.current);
            props.onPick(engine.current?.center() ?? null, "select");
          }
          if (e.key === "Escape") {
            hoveredId.current = null;
            props.onPick(null, "select");
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (hover.current) clearTimeout(hover.current);
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          canvas.current?.setPointerCapture(e.pointerId);
          const values = [...pointers.current.values()];
          gesture.current = {
            ...p,
            camera: props.camera,
            moved: values.length > 1,
            distance:
              values.length > 1
                ? Math.hypot(
                    values[0].x - values[1].x,
                    values[0].y - values[1].y,
                  )
                : 0,
          };
        }}
        onPointerMove={(e) => {
          const p = local(e);
          if (pointers.current.has(e.pointerId) && gesture.current) {
            pointers.current.set(e.pointerId, p);
            const g = gesture.current,
              points = [...pointers.current.values()];
            if (points.length === 2) {
              const distance = Math.hypot(
                points[0].x - points[1].x,
                points[0].y - points[1].y,
              );
              if (g.distance > 0)
                props.setCamera({
                  ...g.camera,
                  fov: clamp(
                    (g.camera.fov * g.distance) / Math.max(distance, 1),
                    20,
                    110,
                  ),
                });
              g.moved = true;
              return;
            }
            const dx = p.x - g.x,
              dy = p.y - g.y;
            if (Math.hypot(dx, dy) > 4) g.moved = true;
            if (g.moved) {
              const scale = g.camera.fov / (canvas.current?.clientWidth || 1);
              props.setCamera({
                ...g.camera,
                azimuth: wrap(g.camera.azimuth - dx * scale),
                altitude: clamp(g.camera.altitude + dy * scale, -20, 85),
              });
            }
            return;
          }
          if (e.pointerType === "touch") return;
          const point = pickAt(p.x, p.y);
          if (point?.star.id === hoveredId.current) return;
          hoveredId.current = point?.star.id ?? null;
          if (hover.current) clearTimeout(hover.current);
          if (point)
            hover.current = setTimeout(() => props.onPick(point, "hover"), 150);
        }}
        onPointerUp={(e) => {
          const p = local(e),
            g = gesture.current;
          pointers.current.delete(e.pointerId);
          if (g && !g.moved)
            props.onPick(
              pickAt(p.x, p.y, e.pointerType === "touch" ? 24 : 14),
              "select",
            );
          if (pointers.current.size === 0) gesture.current = null;
          else if (gesture.current) gesture.current.moved = true;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
        }}
        onPointerLeave={() => {
          if (hover.current) clearTimeout(hover.current);
          hoveredId.current = null;
        }}
      >
        Your browser does not support the sky canvas. Open the catalog to
        explore every star.
      </canvas>
    </>
  );
}
