"use client";

import { useId } from "react";

import {
  getConstellationGeometry,
  type ConstellationPoint,
  type StarRecord,
} from "@/lib/star-catalog";

type Vector3 = readonly [number, number, number];
type ProjectedPoint = ConstellationPoint & { x: number; y: number };

const WIDTH = 320;
const HEIGHT = 260;
const PADDING = 32;
const RADIANS = Math.PI / 180;

// Keep SVG attributes stable across server and browser trig implementations.
function roundForSvg(value: number): number {
  return Number(value.toFixed(3));
}

function unitVector(point: ConstellationPoint): Vector3 {
  const rightAscension = point.raDegrees * RADIANS;
  const declination = point.decDegrees * RADIANS;
  const latitudeRadius = Math.cos(declination);

  return [
    latitudeRadius * Math.cos(rightAscension),
    latitudeRadius * Math.sin(rightAscension),
    Math.sin(declination),
  ];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * A local stereographic projection avoids the RA seam and handles polar groups.
 * The center is the mean unit vector rather than a mean of angular coordinates.
 */
function projectPoints(points: ConstellationPoint[]): ProjectedPoint[] {
  const usablePoints = points.filter(
    (point) =>
      Number.isFinite(point.raDegrees) &&
      Number.isFinite(point.decDegrees) &&
      Math.abs(point.decDegrees) <= 90,
  );

  if (!usablePoints.length) return [];

  const vectors = usablePoints.map(unitVector);
  const sum = vectors.reduce<[number, number, number]>(
    (total, vector) => [
      total[0] + vector[0],
      total[1] + vector[1],
      total[2] + vector[2],
    ],
    [0, 0, 0],
  );
  const length = Math.hypot(...sum);
  const center: Vector3 =
    length > 1e-8
      ? [sum[0] / length, sum[1] / length, sum[2] / length]
      : vectors[0];
  const centerRA = Math.atan2(center[1], center[0]);
  const centerDec = Math.asin(Math.max(-1, Math.min(1, center[2])));
  const east: Vector3 = [-Math.sin(centerRA), Math.cos(centerRA), 0];
  const north: Vector3 = [
    -Math.sin(centerDec) * Math.cos(centerRA),
    -Math.sin(centerDec) * Math.sin(centerRA),
    Math.cos(centerDec),
  ];

  const projected = usablePoints.flatMap((point, index) => {
    const vector = vectors[index];
    const denominator = 1 + dot(vector, center);

    // An antipodal position cannot appear in this local projection.
    if (denominator <= 1e-8) return [];

    return [{
      ...point,
      // Astronomical chart orientation: north up, east left.
      x: (-2 * dot(vector, east)) / denominator,
      y: (-2 * dot(vector, north)) / denominator,
    }];
  });

  if (!projected.length) return [];

  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const scale = Math.min(
    (WIDTH - 2 * PADDING) / Math.max(maxX - minX, 1e-8),
    (HEIGHT - 2 * PADDING) / Math.max(maxY - minY, 1e-8),
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return projected.map((point) => ({
    ...point,
    x: roundForSvg(WIDTH / 2 + (point.x - midX) * scale),
    y: roundForSvg(HEIGHT / 2 + (point.y - midY) * scale),
  }));
}

function starRadius(magnitude: number): number {
  return Number.isFinite(magnitude)
    ? roundForSvg(Math.max(1.5, Math.min(3, 3 - (magnitude + 1.5) * 0.2)))
    : 1.5;
}

export function ConstellationMap({ star }: { star: StarRecord }) {
  const titleId = useId();
  const descriptionId = useId();
  const geometry = getConstellationGeometry(star.constellationAbbr);
  const points = [...(geometry?.stars ?? [])];

  if (!points.some((point) => point.id === star.id)) {
    points.push({
      id: star.id,
      name: star.name,
      raDegrees: star.raDegrees,
      decDegrees: star.decDegrees,
      magnitude: star.magnitude,
    });
  }

  const projected = projectPoints(points);
  const byId = new Map(projected.map((point) => [point.id, point]));
  const selected = byId.get(star.id);
  const segments = (geometry?.lines ?? []).flatMap((line, lineIndex) =>
    line.slice(1).flatMap((endId, index) => {
      const start = byId.get(line[index]);
      const end = byId.get(endId);

      return start && end
        ? [{ key: `${lineIndex}-${index}`, start, end }]
        : [];
    }),
  );

  return (
    <svg
      className="constellation-map"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{`${star.constellation}: ${star.name} selected`}</title>
      <desc id={descriptionId}>
        J2000 star positions from HYG. North is up and east is left.
        {segments.length > 0
          ? " Constellation connections follow Stellarium."
          : " No constellation connections are available."}
        {selected ? ` A ring marks ${star.name}.` : " The selected position is unavailable."}
      </desc>

      <g
        fill="none"
        stroke="var(--chart-line, #737373)"
        strokeWidth={1}
        aria-hidden="true"
      >
        {segments.map(({ key, start, end }) => (
          <line
            key={key}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      <g fill="var(--foreground, #ffffff)" aria-hidden="true">
        {projected.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r={point.id === star.id ? 3 : starRadius(point.magnitude)}
          />
        ))}
      </g>

      {selected && (
        <circle
          cx={selected.x}
          cy={selected.y}
          r={8}
          fill="none"
          stroke="var(--foreground, #ffffff)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          aria-hidden="true"
        />
      )}
    </svg>
  );
}
