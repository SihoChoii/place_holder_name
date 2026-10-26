"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreditsContent } from "@/features/credits";

export function DataSources() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="link" />}>Data sources</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Data sources</DialogTitle></DialogHeader>
        <CreditsContent />
      </DialogContent>
    </Dialog>
  );
}
