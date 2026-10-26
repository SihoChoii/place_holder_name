"use client";

import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StarRecord } from "@/lib/star-catalog";

type Props = {
  stars: StarRecord[];
  selectedId: number | undefined;
  saved: number[];
  onSelect: (star: StarRecord, trigger: HTMLElement) => void;
  onSave: (star: StarRecord) => void;
};

export function StarTable({ stars, selectedId, saved, onSelect, onSave }: Props) {
  return (
    <Table className="star-table">
      <caption className="sr-only">Star catalog. Select a star to view its details.</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="name-column">Star</TableHead>
          <TableHead className="constellation-column">Constellation</TableHead>
          <TableHead className="magnitude-column" aria-label="Magnitude"><span className="wide-label">Magnitude</span><span className="narrow-label" aria-hidden="true">Mag.</span></TableHead>
          <TableHead className="save-column"><span className="sr-only">Save star</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stars.map((star) => {
          const isSaved = saved.includes(star.id);
          return (
            <TableRow key={star.id} data-state={star.id === selectedId ? "selected" : undefined}>
              <TableCell className="name-column">
                <Button variant="row" aria-label={`View ${star.name}`} aria-current={star.id === selectedId ? "true" : undefined} onClick={(event) => onSelect(star, event.currentTarget)}>
                  <span className="star-identity"><span>{star.name}</span><span className="mobile-constellation">{star.constellation}</span></span>
                </Button>
              </TableCell>
              <TableCell className="constellation-column">{star.constellation}</TableCell>
              <TableCell className="magnitude-column">{star.magnitude.toFixed(2).replace("-", "−")}</TableCell>
              <TableCell className="save-column">
                <Button variant="ghost" size="icon" aria-label={`${isSaved ? "Unsave" : "Save"} ${star.name}`} aria-pressed={isSaved} onClick={() => onSave(star)}>
                  <BookmarkIcon aria-hidden="true" fill={isSaved ? "currentColor" : "none"} />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
