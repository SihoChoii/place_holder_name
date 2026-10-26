"use client";
import { useEffect, useSyncExternalStore, useCallback } from "react";
import { schemas, type PublicStarResponse } from "@stargaze/shared";
import { request, RequestError } from "./client";
import { CATALOG_VERSION } from "@/lib/star-catalog";

export interface PublicState {
  data?: PublicStarResponse;
  error?: RequestError;
  loading: boolean;
  updated?: number;
}
const empty: PublicState = { loading: true };
const cache = new Map<number, PublicState>();
const pending = new Map<number, Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export function publicSnapshot(id: number): PublicState {
  return cache.get(id) ?? empty;
}
export function isFresh(state: PublicState, now = Date.now()) {
  return (
    !!state.data &&
    !state.error &&
    state.updated !== undefined &&
    now - state.updated < 15_000
  );
}
export function refreshStar(id: number) {
  if (pending.has(id)) return pending.get(id)!;
  const p = request<PublicStarResponse>(
    `/public/stars/${id}`,
    schemas.PublicStarResponse,
  )
    .then((data) => {
      if (
        data.star.hyg_id !== id ||
        data.star.catalog_version !== CATALOG_VERSION
      )
        throw new RequestError(
          "Catalog versions differ. Ownership is unknown until the service is updated.",
          0,
          "catalog_mismatch",
        );
      if (
        data.recent_tags.some(
          (t) => t.hyg_id !== id || t.moderation_status !== "approved",
        )
      )
        throw new RequestError(
          "Public content could not be verified.",
          0,
          "invalid_response",
        );
      cache.set(id, { data, loading: false, updated: Date.now() });
    })
    .catch((error) => {
      cache.set(id, { ...cache.get(id), loading: false, error });
    })
    .finally(() => {
      pending.delete(id);
      emit();
    });
  pending.set(id, p);
  return p;
}
export function usePublicStar(id: number | null) {
  const snapshot = useSyncExternalStore(
    useCallback((fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }, []),
    useCallback(() => (id === null ? empty : publicSnapshot(id)), [id]),
    () => empty,
  );
  useEffect(() => {
    if (id === null) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (running || stopped || document.hidden) return;
      running = true;
      await refreshStar(id);
      running = false;
      if (!stopped && !document.hidden)
        timer = setTimeout(
          poll,
          Math.max(5_000, (publicSnapshot(id).error?.retryAfter ?? 0) * 1000),
        );
    };
    const visible = () => {
      clearTimeout(timer);
      if (!document.hidden) void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id]);
  return { ...snapshot, retry: () => id !== null && refreshStar(id) };
}
export function ownership(state: PublicState) {
  if (!isFresh(state)) return "Unknown";
  return state.data!.star.claim
    ? `Claimed by ${state.data!.star.claim.owner.display_name}`
    : "Unclaimed";
}
