import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schemas } from "@stargaze/shared";
import { conforms, internalReturn } from "../src/lib/api/client";

test("shared public fixture validates; absent claim, nonfinite coordinates and malformed content fail closed", () => {
  const value = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/shared/fixtures/public-star.200.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(conforms(value, schemas.PublicStarResponse), true);
  const noClaim = structuredClone(value);
  delete noClaim.star.claim;
  assert.equal(conforms(noClaim, schemas.PublicStarResponse), false);
  const bad = structuredClone(value);
  bad.star.ra_hours = NaN;
  assert.equal(conforms(bad, schemas.PublicStarResponse), false);
  const malformed = structuredClone(value);
  malformed.recent_tags = [{ note: "fake" }];
  assert.equal(conforms(malformed, schemas.PublicStarResponse), false);
});
test("login return routes cannot escape this app", () => {
  assert.equal(internalReturn("/star?hyg_id=32263"), "/star?hyg_id=32263");
  for (const path of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/login",
    "/%2f%2fevil.example",
    "/api/me",
    null,
  ])
    assert.equal(internalReturn(path), "/");
});
