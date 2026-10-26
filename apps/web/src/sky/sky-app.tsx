"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import { StarPreview } from "@/features/stars/preview";
import { useCatalog, type SkyStar } from "@/lib/catalog";
import { starHref } from "@/lib/api/client";
import { SkyCanvas } from "./sky-canvas";
import { useObserver } from "./observer";
import { PlacePicker } from "./globe";
import { clamp, horizontal, skyPhase, sunPosition, wrap } from "./astronomy";
import type { Pick } from "./engine";

export function SkyApp() {
  const catalog = useCatalog(),
    state = useObserver(),
    params = useSearchParams();
  const [ready, setReady] = useState(false),
    [now, setNow] = useState<number | null>(null),
    [names, setNames] = useState(false);
  const [selected, setSelected] = useState<SkyStar | null>(null),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState<"hover" | "select">("hover");
  const [point, setPoint] = useState({ x: 0, y: 0 }),
    [visible, setVisible] = useState<Pick[]>([]),
    [aspect, setAspect] = useState(1.6),
    [notice, setNotice] = useState("");
  const anchor = useRef<HTMLSpanElement>(null),
    canvasArea = useRef<HTMLDivElement>(null),
    currentPoints = useRef<Pick[]>([]),
    visibleKey = useRef("");
  const target = params.get("star");
  useEffect(() => {
    // A preview's screen anchor belongs to one camera/viewpoint projection.
    setOpen(false);
  }, [state.camera, state.observer]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!target || !catalog.data) return;
    const star = catalog.data.byId.get(Number(target));
    if (!star) {
      setNotice("That star is not in this catalog.");
      return;
    }
    setSelected(star);
    setOpen(false);
    const h = horizontal(
      star.raDegrees,
      star.decDegrees,
      state.observer,
      Date.now(),
    );
    state.setCamera((c) => ({
      ...c,
      azimuth: h.azimuth,
      altitude: clamp(h.altitude, 0, 85),
    }));
    setNotice(
      h.altitude <= 0
        ? `${star.name} is below the horizon at ${state.observer.name}. Choose another viewpoint to find it.`
        : `${star.name} is selected in the live sky.`,
    );
    // A manual place change also recomputes a requested Find in sky target.
  }, [target, catalog.data, state.observer]);
  function pick(p: Pick | null, type: "hover" | "select") {
    if (!p) {
      setOpen(false);
      return;
    }
    setSelected(p.star);
    setPoint({ x: p.x, y: p.y });
    setKind(type);
    setOpen(true);
  }
  const sun = now ? sunPosition(state.observer, now) : null;
  const direction = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(state.camera.azimuth / 45) % 8
  ];
  return (
    <main id="main-content" className="sky-main">
      <div className="sky-stage" ref={canvasArea}>
        {catalog.data ? (
          <SkyCanvas
            stars={catalog.data.stars}
            observer={state.observer}
            camera={state.camera}
            selected={selected?.id ?? null}
            names={names}
            setCamera={(camera) => {
              setOpen(false);
              state.setCamera(camera);
            }}
            onReady={() => setReady(true)}
            onPick={pick}
            onVisible={(points, ratio) => {
              currentPoints.current = points;
              const top = points.slice(0, 12),
                key = top.map((p) => p.star.id).join(",");
              if (key !== visibleKey.current) {
                visibleKey.current = key;
                setVisible(top);
              }
              setAspect((a) => (Math.abs(a - ratio) > 0.01 ? ratio : a));
            }}
          />
        ) : null}
        {!ready && !catalog.error && (
          <div className="sky-loading" role="status">
            <span className="loading-mark" aria-hidden="true">
              ✦
            </span>
            <h1>Opening your sky</h1>
            <p>
              {catalog.data
                ? "Drawing the live sky…"
                : "Loading 8,920 stars from HYG v4.4…"}
            </p>
            <Link href="/catalog">Browse the catalog</Link>
          </div>
        )}
        {catalog.error && (
          <div className="sky-loading" role="alert">
            <h1>The stars couldn’t load.</h1>
            <p>{catalog.error}</p>
            <Button onClick={catalog.retry}>Retry catalog</Button>
            <Link href="/catalog">Open catalog</Link>
          </div>
        )}
        <div className="sky-heading">
          <h1>Live sky</h1>
          <p>
            {sun ? skyPhase(sun.altitude) : "Current sky"}{" "}
            <span className="live-dot" aria-hidden="true" />{" "}
            <time dateTime={now ? new Date(now).toISOString() : undefined}>
              {now
                ? new Date(now).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                    timeZone: "UTC",
                  })
                : "—"}{" "}
              UTC
            </time>
          </p>
        </div>
        <div className="sky-place">
          <PlacePicker aspect={aspect} />
        </div>
        {notice && (
          <div className="sky-notice" role="status">
            <p>{notice}</p>
            {selected && (
              <Link href={starHref(selected.id)}>
                Read {selected.name}’s details
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss sky notice"
              onClick={() => setNotice("")}
            >
              <XIcon />
            </Button>
          </div>
        )}
        <span
          className="preview-anchor"
          ref={anchor}
          style={{ left: point.x, top: point.y }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent
            anchor={anchor}
            initialFocus={kind === "hover" ? false : true}
            finalFocus={() =>
              canvasArea.current?.querySelector("canvas") ?? false
            }
            side="right"
            align="start"
          >
            {selected && (
              <>
                <div className="preview-heading">
                  <PopoverTitle>{selected.name}</PopoverTitle>
                  <PopoverClose
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Close star preview"
                      />
                    }
                  >
                    <XIcon />
                  </PopoverClose>
                </div>
                <StarPreview key={selected.id} star={selected} />
              </>
            )}
          </PopoverContent>
        </Popover>
        <div className="sky-controls">
          <div className="camera-readout">
            <span>
              {direction} {Math.round(state.camera.azimuth)}°
            </span>
            <span>Altitude {Math.round(state.camera.altitude)}°</span>
            <span>FOV {Math.round(state.camera.fov)}°</span>
          </div>
          <div className="camera-buttons">
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom in"
              disabled={state.camera.fov <= 20}
              onClick={() =>
                state.setCamera((c) => ({
                  ...c,
                  fov: clamp(c.fov - 10, 20, 110),
                }))
              }
            >
              <PlusIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom out"
              disabled={state.camera.fov >= 110}
              onClick={() =>
                state.setCamera((c) => ({
                  ...c,
                  fov: clamp(c.fov + 10, 20, 110),
                }))
              }
            >
              <MinusIcon />
            </Button>
            <Button
              variant="outline"
              aria-pressed={names}
              onClick={() => setNames((v) => !v)}
            >
              Names
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                state.setCamera((c) => ({
                  ...c,
                  azimuth: wrap(c.azimuth + 90),
                }))
              }
            >
              Turn 90°
            </Button>
          </div>
        </div>
      </div>
      <div className="sky-status">
        <p id="sky-instructions">
          Drag to look around. Scroll or pinch to zoom. Keyboard: arrows, + / −,
          Enter to select.
        </p>
        <p role="status">{state.locationStatus}</p>
      </div>
      <section
        className="view-catalog page-width"
        aria-labelledby="in-view-heading"
      >
        <div className="section-heading">
          <h2 id="in-view-heading">In this view</h2>
          <Link
            href="/catalog"
            className={buttonVariants({ variant: "outline" })}
          >
            Browse all 8,920 stars
          </Link>
        </div>
        <p className="muted-text">
          Ownership coverage is partial. Select a star to check. A single ring
          means unclaimed; a double ring means claimed. Unchecked stars have no
          ring.
        </p>
        {visible.length ? (
          <ul className="visible-stars">
            {visible.map((p) => (
              <li key={p.star.id}>
                <Button
                  variant="row"
                  onClick={() =>
                    pick(
                      currentPoints.current.find(
                        (point) => point.star.id === p.star.id,
                      ) ?? null,
                      "select",
                    )
                  }
                >
                  {p.star.name}
                  <span className="muted-text">{p.star.constellation}</span>
                </Button>
                <Link
                  href={starHref(p.star.id)}
                  aria-label={`Open ${p.star.name} details`}
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        ) : ready ? (
          <p className="empty-sky">
            {sun && sun.altitude >= 0
              ? "It is daytime here. Choose a currently dark place, or browse the catalog."
              : "No stars are visible in this direction. Turn or zoom out to explore."}
          </p>
        ) : (
          <p>Loading visible stars…</p>
        )}
      </section>
    </main>
  );
}
