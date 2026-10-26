"use client";
import { useEffect, useMemo, useState } from "react";
import { Globe2Icon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  RAD,
  skyPhase,
  sunPosition,
  type Observer,
  type Camera,
} from "./astronomy";
import { PRESETS, useObserver } from "./observer";

type Line = [number, number][];
let coastPromise: Promise<Line[]> | undefined;
function coastlines() {
  coastPromise ??= fetch("/earth-land.json")
    .then((r) => {
      if (!r.ok) throw new Error("Coastline unavailable");
      return r.json();
    })
    .then((r) => r.lines);
  return coastPromise;
}
export function Globe({
  observer,
  camera,
  aspect = 1.6,
}: {
  observer: Observer;
  camera: Camera;
  aspect?: number;
}) {
  const [land, setLand] = useState<Line[]>([]);
  useEffect(() => {
    let live = true;
    coastlines()
      .then((v) => {
        if (live) setLand(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const paths = useMemo(() => {
    const centerLat = observer.latitude * RAD,
      centerLon = observer.longitude * RAD;
    function linePath(points: Line) {
      let path = "",
        drawing = false;
      for (const [lon, lat] of points) {
        const p = lat * RAD,
          l = lon * RAD - centerLon,
          z =
            Math.sin(centerLat) * Math.sin(p) +
            Math.cos(centerLat) * Math.cos(p) * Math.cos(l);
        if (z < 0) {
          drawing = false;
          continue;
        }
        const x = 100 + 88 * Math.cos(p) * Math.sin(l),
          y =
            100 -
            88 *
              (Math.cos(centerLat) * Math.sin(p) -
                Math.sin(centerLat) * Math.cos(p) * Math.cos(l));
        path += `${drawing ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        drawing = true;
      }
      return path;
    }
    const grid: Line[] = [];
    for (let lat = -60; lat <= 60; lat += 30)
      grid.push(Array.from({ length: 181 }, (_, i) => [i * 2 - 180, lat]));
    for (let lon = -180; lon < 180; lon += 30)
      grid.push(Array.from({ length: 91 }, (_, i) => [lon, i * 2 - 90]));
    return { land: land.map(linePath), grid: grid.map(linePath) };
  }, [land, observer.latitude, observer.longitude]);
  const vertical =
      (2 * Math.atan(Math.tan((camera.fov * RAD) / 2) / aspect)) / RAD,
    w = camera.fov * 0.8,
    h = vertical * 0.8;
  return (
    <svg
      className="earth-globe"
      viewBox="0 0 200 200"
      role="img"
      aria-label={`Earth centered on ${observer.name}. Viewing direction ${Math.round(camera.azimuth)} degrees; horizontal field of view ${Math.round(camera.fov)} degrees.`}
    >
      <circle
        cx="100"
        cy="100"
        r="88"
        fill="var(--card)"
        stroke="var(--input)"
      />
      <g fill="none" stroke="var(--border)" strokeWidth=".8">
        {paths.grid.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g fill="none" stroke="var(--muted-foreground)" strokeWidth=".8">
        {paths.land.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g
        transform={`rotate(${camera.azimuth} 100 100)`}
        data-testid="globe-viewfinder"
      >
        <rect
          x={100 - w / 2}
          y={100 - h / 2}
          width={w}
          height={h}
          fill="var(--foreground)"
          fillOpacity=".06"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
        <path
          d={`M100 ${100 - h / 2}v-14m-4 4 4-4 4 4`}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
      </g>
      <circle
        cx="100"
        cy="100"
        r="3.5"
        fill="var(--foreground)"
        stroke="var(--background)"
        strokeWidth="1.5"
      />
      <text
        x="100"
        y="9"
        textAnchor="middle"
        fill="var(--muted-foreground)"
        fontSize="10"
      >
        N
      </text>
    </svg>
  );
}
export function PlacePicker({ aspect }: { aspect: number }) {
  const state = useObserver();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="place-control">
      <Globe observer={state.observer} camera={state.camera} aspect={aspect} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" />}>
          <MapPinIcon aria-hidden="true" />
          {state.observer.name}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose your viewpoint</DialogTitle>
            <DialogDescription>
              Explore another place at the current time. Your location stays on
              this device.
            </DialogDescription>
          </DialogHeader>
          <div className="place-presets">
            {PRESETS.map((p) => (
              <Button
                variant="outline"
                key={p.name}
                onClick={() => {
                  state.choose(p);
                  setOpen(false);
                }}
              >
                <span>{p.name}</span>
                <span className="text-muted-foreground">
                  {skyPhase(sunPosition(p, Date.now()).altitude)}
                </span>
              </Button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              state.locate();
              setOpen(false);
            }}
          >
            <Globe2Icon aria-hidden="true" />
            Use my location
          </Button>
          <form
            className="coordinate-form"
            onSubmit={(e) => {
              e.preventDefault();
              const latitude = Number(lat),
                longitude = Number(lon);
              if (
                !lat.trim() ||
                !lon.trim() ||
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                Math.abs(latitude) > 90 ||
                Math.abs(longitude) > 180
              ) {
                setError(
                  "Latitude must be −90 to 90 and longitude −180 to 180.",
                );
                return;
              }
              state.choose({ name: "Custom coordinates", latitude, longitude });
              setError("");
              setOpen(false);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="latitude">
                  Latitude (north + / south −)
                </FieldLabel>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? "coordinate-error" : undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="longitude">
                  Longitude (east + / west −)
                </FieldLabel>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? "coordinate-error" : undefined}
                />
              </Field>
              {error && (
                <p role="alert" id="coordinate-error">
                  {error}
                </p>
              )}
              <Button type="submit">Use coordinates</Button>
            </FieldGroup>
          </form>
          <p className="muted-text">
            The globe rectangle shows viewing direction and field of view. It is
            a schematic, not a geographic footprint.
          </p>
        </DialogContent>
      </Dialog>
      <p className="observer-coordinates">
        {state.observer.latitude.toFixed(3)}°,{" "}
        {state.observer.longitude.toFixed(3)}°
      </p>
    </div>
  );
}
