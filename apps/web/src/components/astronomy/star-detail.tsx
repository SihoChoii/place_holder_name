"use client";

import { useState } from "react";
import { BookmarkCheckIcon, BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ConstellationMap } from "@/components/astronomy/constellation-map";
import { formatDec, formatRA, type StarRecord } from "@/lib/star-catalog";

type Props = { star: StarRecord; saved: boolean; note: string; onSave: () => void; onNote: (note: string) => void; inSheet?: boolean };

export function StarDetail({ star, saved, note, onSave, onNote, inSheet = false }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(note);

  function setOpen(open: boolean) {
    if (open) setDraft(note);
    setNoteOpen(open);
  }

  return (
    <div className="star-detail">
      {!inSheet && <header className="detail-heading"><h2>{star.name}</h2><p>{star.constellation}</p></header>}
      <ConstellationMap star={star} />
      <dl className="measurements">
        <div><dt>Right ascension</dt><dd>{formatRA(star.raDegrees)}</dd></div>
        <div><dt>Declination</dt><dd>{formatDec(star.decDegrees)}</dd></div>
        <div><dt>Distance</dt><dd>{star.distanceLightYears === null ? "Not available" : `${star.distanceLightYears.toLocaleString("en-US", { maximumFractionDigits: 2 })} ly`}</dd></div>
      </dl>
      <div className="detail-actions">
        <Button className="w-full" onClick={onSave} aria-pressed={saved}>{saved ? <BookmarkCheckIcon data-icon="inline-start" aria-hidden="true" /> : <BookmarkIcon data-icon="inline-start" aria-hidden="true" />}{saved ? "Saved" : "Save star"}</Button>
        <Dialog open={noteOpen} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="outline" className="w-full" />}>{note ? "Edit note" : "Add note"}</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{note ? "Edit note" : "Add note"}</DialogTitle></DialogHeader>
            <form onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; onNote(draft); setNoteOpen(false); }} className="note-form">
              <FieldGroup><Field><FieldLabel htmlFor={`note-${star.id}-${inSheet ? "sheet" : "panel"}`}>{star.name}</FieldLabel><Textarea id={`note-${star.id}-${inSheet ? "sheet" : "panel"}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} maxLength={2000} autoFocus /></Field></FieldGroup>
              <DialogFooter>{note && <Button type="button" variant="ghost" className="mr-auto" onClick={() => { onNote(""); setNoteOpen(false); }}>Delete note</Button>}<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button type="submit" disabled={!draft.trim()}>Save note</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {note && <section className="personal-note"><Separator /><h3>Your note</h3><p>{note}</p></section>}
    </div>
  );
}
