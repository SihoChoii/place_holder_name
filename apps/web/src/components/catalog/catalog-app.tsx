"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Pagination, PaginationButton, PaginationContent, PaginationItem, PaginationNextButton, PaginationPreviousButton } from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogToolbar, type CatalogSort } from "@/components/catalog/catalog-toolbar";
import { StarTable } from "@/components/catalog/star-table";
import { StarDetail } from "@/components/astronomy/star-detail";
import { DataSources } from "@/components/catalog/data-sources";
import { useLibrary } from "@/hooks/use-library";
import { DEFAULT_STAR_ID, PAGE_SIZE, type StarRecord } from "@/lib/star-catalog";
import { useCatalog } from "@/lib/catalog";

export function CatalogApp() {
  const [view, setView] = useState("catalog");
  const [query, setQuery] = useState("");
  const [constellation, setConstellation] = useState("all");
  const [sort, setSort] = useState<CatalogSort>("brightness");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(DEFAULT_STAR_ID);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const savedTab = useRef<HTMLButtonElement | null>(null);
  const library = useLibrary();
  const catalog = useCatalog();

  const filtered = useMemo(() => {
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const needle = normalize(query.trim());
    const numeric = /^(hyg|hip)?\s*(\d+)$/.exec(needle);
    return (catalog.data?.stars ?? []).filter(star =>
      (view !== "saved" || library.saved.includes(star.id)) &&
      (constellation === "all" || constellation === star.constellationAbbr) &&
      (!needle || (numeric ? numeric[1] === "hip" ? star.hipId === Number(numeric[2]) : star.id === Number(numeric[2]) || (!numeric[1] && star.hipId === Number(numeric[2])) : normalize(`${star.name} ${star.bayerLabel ?? ""} ${star.constellation} ${star.constellationAbbr}`).includes(needle)))
    ).sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : a.magnitude-b.magnitude);
  }, [catalog.data,query,constellation,sort,view,library.saved]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStars = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = pageStars.find((star) => star.id === selectedId) ?? pageStars[0];
  const isFiltering = query.length > 0 || constellation !== "all";

  function resetFilters() { setQuery(""); setConstellation("all"); setPage(1); }
  function selectStar(star: StarRecord, trigger: HTMLElement) {
    setSelectedId(star.id);
    returnFocus.current = trigger;
    setAnnouncement(`${star.name} selected`);
    if (window.matchMedia("(max-width: 1000px)").matches) setSheetOpen(true);
  }
  function toggleSaved(star: StarRecord) {
    if (view === "saved" && library.saved.includes(star.id)) {
      returnFocus.current = savedTab.current;
      setSheetOpen(false);
      if (!sheetOpen) savedTab.current?.focus();
    }
    setAnnouncement(`${star.name} ${library.saved.includes(star.id) ? "removed from saved stars" : "saved"}`);
    library.toggleSaved(star.id);
  }
  function switchView(value: unknown) {
    setSheetOpen(false);
    setView(value === "saved" ? "saved" : "catalog");
    resetFilters();
  }

  const content = (
    <main id="main-content" className="page-width catalog-main">
      <h1>{view === "saved" ? "Saved stars" : "Star catalog"}</h1>
      <div className="catalog-layout" data-empty={!selected || undefined}>
        <section className="catalog-list" aria-label={view === "saved" ? "Saved stars" : "Star catalog"}>
          <CatalogToolbar constellations={catalog.data?.constellations} query={query} constellation={constellation} sort={sort} onQuery={(value) => { setQuery(value); setPage(1); }} onConstellation={(value) => { setConstellation(value); setPage(1); }} onSort={(value) => { setSort(value); setPage(1); }} />
          <div className="catalog-results">
            {catalog.error ? <div role="alert"><p>{catalog.error}</p><Button onClick={catalog.retry}>Retry catalog</Button></div> : !catalog.data ? <p role="status">Loading 8,920 catalog stars…</p> : pageStars.length > 0 ? <StarTable stars={pageStars} selectedId={selected?.id} saved={library.saved} onSelect={selectStar} onSave={toggleSaved} /> : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{view === "saved" && !isFiltering ? "No saved stars yet" : "No stars found"}</EmptyTitle>
                  {view === "saved" && !isFiltering && <EmptyDescription>Save a star to find it here.</EmptyDescription>}
                </EmptyHeader>
                <EmptyContent><Button variant="outline" onClick={isFiltering ? resetFilters : () => switchView("catalog")}>{isFiltering ? "Clear filters" : "Browse catalog"}</Button></EmptyContent>
              </Empty>
            )}
          </div>
          {pageCount > 1 && (
            <Pagination className="catalog-pagination" aria-label="Catalog pages">
              <PaginationContent>
                <PaginationItem><PaginationPreviousButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} /></PaginationItem>
                {[...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter(number => number > 0 && number <= pageCount).sort((a,b)=>a-b).map((number) => <PaginationItem key={number} className="desktop-page-number"><PaginationButton isActive={number === currentPage} aria-label={`Page ${number}`} onClick={() => setPage(number)}>{number}</PaginationButton></PaginationItem>)}
                <PaginationItem className="mobile-page-status"><span aria-label={`Page ${currentPage} of ${pageCount}`}>{currentPage} / {pageCount}</span></PaginationItem>
                <PaginationItem><PaginationNextButton disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </section>
        {selected && <aside className="desktop-detail" aria-label={`${selected.name} details`}><StarDetail key={selected.id} star={selected} saved={library.saved.includes(selected.id)} note={library.notes[selected.id] ?? ""} onSave={() => toggleSaved(selected)} onNote={(note) => { library.saveNote(selected.id, note); setAnnouncement(`Note ${note.trim() ? "saved" : "deleted"} for ${selected.name}`); }} /></aside>}
      </div>
    </main>
  );

  return (
    <Tabs value={view} onValueChange={switchView} className="app-shell">
      <a href="#main-content" className="skip-link">Skip to catalog</a>
      <header className="site-header page-width">
        <TabsList variant="line" className="main-tabs" aria-label="Browse stars"><TabsTrigger value="catalog">Catalog</TabsTrigger><TabsTrigger value="saved" ref={savedTab}>Saved</TabsTrigger></TabsList>
      </header>
      <Separator />
      <TabsContent value="catalog">{view === "catalog" && content}</TabsContent>
      <TabsContent value="saved">{view === "saved" && content}</TabsContent>
      <Separator />
      <footer className="page-width site-footer"><span aria-live="polite" aria-atomic="true">{filtered.length} {filtered.length === 1 ? "star" : "stars"}</span><DataSources /></footer>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <Sheet open={sheetOpen && !!selected} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" finalFocus={returnFocus}>
          {selected && <><SheetHeader><SheetTitle>{selected.name}</SheetTitle><SheetDescription>{selected.constellation}</SheetDescription></SheetHeader><div className="mobile-detail"><StarDetail key={selected.id} star={selected} saved={library.saved.includes(selected.id)} note={library.notes[selected.id] ?? ""} onSave={() => toggleSaved(selected)} onNote={(note) => library.saveNote(selected.id, note)} inSheet /></div></>}
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}
