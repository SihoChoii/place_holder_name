"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "stargaze-reference-library-v1";
// Validate storage shape without discarding real full-catalog entries before the asset loads.
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
type Library = { saved: number[]; notes: Record<string, string> };

export function useLibrary() {
  const [library, setLibrary] = useState<Library>({ saved: [], notes: {} });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (raw && typeof raw === "object") {
        const value = raw as Partial<Library>;
        const saved = Array.isArray(value.saved)
          ? [...new Set(value.saved.filter(validId))]
          : [];
        const notes = Object.fromEntries(
          Object.entries(value.notes && typeof value.notes === "object" ? value.notes : {})
            .filter(([id, note]) => validId(Number(id)) && typeof note === "string")
            .map(([id, note]) => [id, note.slice(0, 2000)]),
        );
        setLibrary({ saved, notes });
      }
    } catch {
      // A blocked or malformed store should not prevent browsing.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch {
      // The reference still supports session-local saves in restricted browsers.
    }
  }, [library, ready]);

  function toggleSaved(id: number) {
    setLibrary((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((value) => value !== id)
        : [...current.saved, id],
    }));
  }

  function saveNote(id: number, note: string) {
    setLibrary((current) => ({ ...current, notes: { ...current.notes, [id]: note.trim() } }));
  }

  return { ...library, ready, toggleSaved, saveNote };
}
