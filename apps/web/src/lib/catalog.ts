"use client";

import { useEffect, useState } from "react";
import { CATALOG_VERSION, type StarRecord } from "@/lib/star-catalog";

export { CATALOG_VERSION };
export interface SkyStar extends StarRecord {
  hipId: number | null;
  colorIndex: number | null;
  spectralType: string | null;
  luminosity: number | null;
  mass: number | null;
  radius: number | null;
  temperature: number | null;
  estimated: boolean;
  gravity: number | null;
  estimatedGravity: number | null;
  planetCount: number;
  planets: string[];
  wikiTitle: string | null;
}
export interface Catalog {
  stars: SkyStar[];
  byId: Map<number, SkyStar>;
  constellations: { abbr: string; name: string }[];
}
let promise: Promise<Catalog> | undefined;
let ready: Catalog | undefined;
const optionalNumber = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
const optionalString = (v: unknown) => v === null || typeof v === "string";

export async function loadCatalog(): Promise<Catalog> {
  if (ready) return ready;
  if (promise) return promise;
  promise = (async () => {
    const response = await fetch(`/catalog/${CATALOG_VERSION}.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("The star catalog could not be loaded.");
    const data = await response.json();
    if (
      data.schema !== 1 ||
      data.version !== CATALOG_VERSION ||
      data.count !== 8920 ||
      !Array.isArray(data.rows) ||
      data.rows.length !== 8920 ||
      !Array.isArray(data.constellations)
    )
      throw new Error("The star catalog version does not match this app.");
    const constellations = data.constellations as {
      abbr: string;
      name: string;
    }[];
    if (
      !constellations.every(
        (c) => typeof c.abbr === "string" && typeof c.name === "string",
      )
    )
      throw new Error("Invalid constellation metadata.");
    const names = new Map(constellations.map((c) => [c.abbr, c.name]));
    const stars = data.rows.map((r: unknown[]): SkyStar => {
      if (
        !Array.isArray(r) ||
        r.length !== 21 ||
        !Number.isInteger(r[0]) ||
        !optionalNumber(r[1]) ||
        ![2, 3, 4, 10, 20].every((i) => optionalString(r[i])) ||
        ![5, 6, 7].every(
          (i) => typeof r[i] === "number" && Number.isFinite(r[i]),
        ) ||
        ![8, 9, 11, 12, 13, 14, 16, 17].every((i) => optionalNumber(r[i])) ||
        typeof r[15] !== "boolean" ||
        !Number.isInteger(r[18]) ||
        !Array.isArray(r[19]) ||
        !r[19].every((p) => typeof p === "string")
      )
        throw new Error("Invalid catalog record.");
      const n = r as [
        number,
        number | null,
        string | null,
        string | null,
        string | null,
        number,
        number,
        number,
        number | null,
        number | null,
        string | null,
        number | null,
        number | null,
        number | null,
        number | null,
        boolean,
        number | null,
        number | null,
        number,
        string[],
        string | null,
      ];
      if (
        n[0] <= 0 ||
        n[5] < 0 ||
        n[5] >= 360 ||
        Math.abs(n[6]) > 90 ||
        n[7] > 6.5
      )
        throw new Error("Invalid catalog coordinates.");
      return {
        id: n[0],
        hipId: n[1],
        name: n[2] ?? n[3] ?? `HYG ${n[0]}`,
        bayerLabel: n[3],
        constellation: names.get(n[4] ?? "") ?? n[4] ?? "Unknown",
        constellationAbbr: n[4] ?? "",
        raDegrees: n[5],
        decDegrees: n[6],
        magnitude: n[7],
        distanceLightYears: n[8],
        colorIndex: n[9],
        spectralType: n[10],
        luminosity: n[11],
        mass: n[12],
        radius: n[13],
        temperature: n[14],
        estimated: n[15],
        gravity: n[16],
        estimatedGravity: n[17],
        planetCount: n[18],
        planets: n[19],
        wikiTitle: n[20],
      };
    });
    const byId = new Map<number, SkyStar>(stars.map((s: SkyStar) => [s.id, s]));
    if (byId.size !== 8920) throw new Error("Duplicate star identifiers.");
    ready = { stars, byId, constellations };
    return ready;
  })().catch((e) => {
    promise = undefined;
    throw e;
  });
  return promise;
}

export function useCatalog() {
  const [data, setData] = useState<Catalog | undefined>(ready);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    loadCatalog()
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return { data, error, retry: () => setAttempt((a) => a + 1) };
}
