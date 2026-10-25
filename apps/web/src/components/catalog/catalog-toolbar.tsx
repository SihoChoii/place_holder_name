"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONSTELLATIONS } from "@/lib/star-catalog";

const constellationItems = [{ value: "all", label: "All constellations" }, ...CONSTELLATIONS.map((c) => ({ value: c.abbr, label: c.name }))];
const sortItems = [{ value: "brightness", label: "Brightest first" }, { value: "name", label: "Name A–Z" }];

export type CatalogSort = "brightness" | "name";

type Props = {
  query: string;
  constellation: string;
  sort: CatalogSort;
  onQuery: (value: string) => void;
  onConstellation: (value: string) => void;
  onSort: (value: CatalogSort) => void;
};

export function CatalogToolbar({ query, constellation, sort, onQuery, onConstellation, onSort }: Props) {
  return (
    <FieldGroup className="catalog-toolbar">
      <Field className="search-field">
        <FieldLabel htmlFor="star-search" className="sr-only">Search stars</FieldLabel>
        <InputGroup>
          <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput id="star-search" type="search" placeholder="Search stars" value={query} onChange={(event) => onQuery(event.target.value)} autoComplete="off" />
          {query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onQuery("")}><XIcon aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="constellation-filter" className="sr-only">Constellation</FieldLabel>
        <Select items={constellationItems} value={constellation} onValueChange={(value) => onConstellation(value ?? "all")}>
          <SelectTrigger id="constellation-filter" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>{constellationItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="star-sort" className="sr-only">Sort stars</FieldLabel>
        <Select items={sortItems} value={sort} onValueChange={(value) => onSort(value === "name" ? "name" : "brightness")}>
          <SelectTrigger id="star-sort" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>{sortItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
