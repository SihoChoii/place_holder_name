"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CATALOG_ATTRIBUTION, CATALOG_LICENSE } from "@/lib/star-catalog";

export function DataSources() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="link" />}>Data sources</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Data sources</DialogTitle></DialogHeader>
        <div className="source-content">
          <p>24 named stars from the HYG catalog. Coordinates use J2000.</p>
          <ul>{CATALOG_ATTRIBUTION.map((source) => <li key={source.name}><a href={source.href} target="_blank" rel="noreferrer">{source.name}</a><span>{source.author} · {source.license}</span></li>)}</ul>
          <p>The catalog subset and constellation geometry are adapted from these sources and shared under <a href={CATALOG_LICENSE.href} target="_blank" rel="noreferrer">{CATALOG_LICENSE.name}</a>.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
