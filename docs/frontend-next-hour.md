# StarTagger: best use of the additional hour

Exploration started October 25, 2026 at **5:28:50 PM PDT**. The newly stated one-hour window ends at approximately **6:28:50 PM PDT**. This document records findings and proposed work; the application changes below have **not** been implemented in this exploration pass. Existing frontend and concurrent `docs/brand` work are preserved.

## Recommendation

Spend the hour on three concrete interaction/freshness fixes, then an authoritative public claims snapshot, and finish with production-browser regression. This would make the existing journey more dependable and remove its largest functional limitation: ownership is currently confirmed only for individually inspected stars.

Keep the existing framework, components, live clock, one initial location request, Starbase fallback, and static star shell. Do not spend this hour on a framework migration, new rendering engine, generated star pages, or several unfinished social features.

## Findings from exploration

### 1. Expired ownership remains displayed while a resumed tab refreshes

**Reproduced in Chromium against the actual API with controlled visibility and network delay.** After the UI confirmed `Unclaimed`, visibility callbacks were suspended for 16 seconds, exceeding the 15-second freshness window. On resume, a fresh request started but the page still displayed `Unclaimed` while that response was delayed four seconds. The data was not yet re-confirmed.

The cache checks age when rendering, but starting a refresh or returning to a visible tab does not publish a new snapshot. A detail page can therefore retain the previously rendered claim label until the request completes.

- Sources: [public cache](/Users/sihochoi/Documents/place_holder_name/apps/web/src/lib/api/public-star.ts:67), [detail ownership display](/Users/sihochoi/Documents/place_holder_name/apps/web/src/features/stars/star-page.tsx:104).
- Fix: publish freshness changes on expiry/resume, immediately show `Unknown` or `Checking ownership…` for expired data, and reconcile only a successful matching-catalog response. Apply the same rule to rings, previews, and the detail page.
- Exit check: background → resume with slow/failed API → no expired claim presented as current; facts remain available; recovery updates the existing view.
- Estimated implementation and focused checks: **4–6 minutes**.

### 2. Expanded comments stop following the refreshed public response

**Reproduced with explicit test-only shared-fixture interception.** Open `Read all comments` on a post with two approved comments. Change the next public-star response to three comments, including a new approved comment. The page updates to `3 comments`, but the new comment is absent and neither `Read all comments` nor `More comments` remains available. Then remove all comments from both test endpoints: the count becomes `0 comments`, but an old comment remains visible. The local expanded list takes precedence indefinitely.

- Source: [expanded comment state and rendering](/Users/sihochoi/Documents/place_holder_name/apps/web/src/features/stars/public-posts.tsx:100).
- Backend context: comments can be deleted, and the public endpoint excludes deleted/unapproved comments. See [public comment reads](/Users/sihochoi/Documents/place_holder_name/apps/api/src/services/content.ts:65) and [comment deletion](/Users/sihochoi/Documents/place_holder_name/apps/api/src/services/social.ts:52).
- Fix: refresh the active expanded comment page while visible; replace it with server-confirmed rows, reconcile counts, deduplicate pagination, and clear or revalidate older cached pages. Cancel on unmount, honor retry timing, and remove unavailable content after a confirming response.
- Exit checks: new approved comment appears; deleted comment disappears; counts and rows agree; a slow/error response cannot restore obsolete rows; pagination remains usable.
- Estimated implementation and focused checks: **7–10 minutes**.

### 3. Pinch-to-one-finger continuation reuses the old camera baseline

**Reproduced at the browser event-handler level.** A two-finger pinch changed FOV from 85° to 46°. After an explicit pointer-up for the second active pointer, moving the remaining finger 15 CSS px changed FOV back to 85° and heading from 270° to 289°. The one-finger drag should preserve the pinched FOV.

This check combined Chromium touch events with a synthetic pointer-up to isolate the transition. It is evidence of the handler-state defect, **not physical-device acceptance**. Ordinary pinch-only tests still pass.

- Source: [pointer transition handling](/Users/sihochoi/Documents/place_holder_name/apps/web/src/sky/sky-canvas.tsx:198).
- Fix: when one pointer remains, reset the gesture origin to that pointer and the latest camera; clear pinch distance. Handle cancellation and lost capture consistently.
- Exit checks: pinch → lift either finger → drag preserves zoom without jumping; cancellation never selects a star accidentally; repeat on a physical touch device when available.
- Estimated implementation and focused checks: **3–5 minutes**.

### 4. Complete claim coverage can be added without model services

**Confirmed by code inspection.** The backend has authoritative `star_claims` data with unique HYG IDs and the existing public `ClaimInfo` representation. Public routes currently offer per-star reads, feed, search, comments, and media, but no complete claim index. The index must be a deliberate shared API addition; it cannot be inferred from feed entries.

Proposed minimal contract, **not an existing endpoint**:

```text
GET /api/public/claims
{
  catalog_version,
  coverage: "complete",
  total_stars: 8920,
  server_time,
  claims: ClaimInfo[]
}
```

- Query the authoritative claims table joined to public user identity in one consistent bounded read, restricted to the pinned catalog. Include claims with zero posts and claims whose only posts are pending/rejected.
- Return only the already-public owner ID/display name and claim date. No emails, private processing states, or pending media. The response is bounded by the catalog's 8,920 stars; measure its actual/worst-case payload before choosing refresh frequency.
- Add the shared type/schema, fixtures, API tests, route matrix/API documentation, and generated OpenAPI. Recheck for concurrent backend work before creating a duplicate contract.
- Let the frontend treat absence as confirmed unclaimed **only** after a valid, complete, fresh, matching-version snapshot. A missing/partial/failed/mismatched snapshot remains unknown. Keep per-star detail reads for content and fresh confirmation, with deterministic reconciliation so older responses cannot overwrite newer evidence.
- Fetch one snapshot, not 8,920 individual requests; pause background polling. Keep media hydration bounded to inspected stars. ETags, deltas, and thumbnails can wait.
- Exit checks: claim with no posts; claim with pending-only posts; unclaimed ID; incomplete/mismatched/failing snapshot; stale tab resume; public/private separation; marker/preview/detail agreement.
- Sources: [claim serialization](/Users/sihochoi/Documents/place_holder_name/apps/api/src/services/claims.ts:9), [table and uniqueness](/Users/sihochoi/Documents/place_holder_name/packages/db/migrations/001_initial.sql:11), [shared types](/Users/sihochoi/Documents/place_holder_name/packages/shared/src/types.ts:13), [public routes](/Users/sihochoi/Documents/place_holder_name/apps/api/src/routes/content.ts:119).
- Estimated implementation plus focused API/browser checks: **20–30 minutes**. This is the highest-value feature extension, but it is also the item to cut if correctness fixes take longer.

### 5. The new brand guide provides a small, concrete polish task

[The current brand guide](/Users/sihochoi/Documents/place_holder_name/docs/brand/README.md:28) specifies **StarTagger**. The header, page titles, credits, and account copy still mix `Stargaze` and `Star Tagger`.

Apply the documented spelling to public web copy and accessible names, update the corresponding browser expectations, and leave package names/local-storage keys intact. The logo remains an open design decision in the guide; renaming copy does not require inventing a new logo. Estimated **3–5 minutes**, only if the main work stays ahead of schedule.

### 6. Make the preview handoff dependable

Port 4000 was not listening at the start of exploration. The previous server log records a normal `SIGTERM` shutdown, not an application exception. A restarted preview later also received `SIGTERM`. The source of those signals was not established; do not report this as an application crash.

Provide a named, persistent local terminal/demo startup with explicit isolated database/media paths and verify it remains available through navigation and the end of the run. Do not rely on an unverified background command lifetime. The remaining exploratory checks use a disposable server in the same test process to avoid that dependency. Budget **2–4 minutes** within final handoff/verification.

## Suggested time allocation

These are timeboxes, not guarantees. The first several minutes have already been used for the exploration above.

| Elapsed time in the new hour | Work | Exit condition |
| --- | --- | --- |
| 0–6 min | Inspect current code/contracts; reproduce follow-up issues | Findings and evidence recorded; no guessed integration |
| 6–24 min | Ownership freshness, expanded comments, gesture transition | Focused regression checks reproduce before/fix after |
| 24–44 min | Minimal complete claims snapshot and frontend join | Contract/API/browser checks pass, or retain explicit partial coverage |
| 44–57 min | Production build and browser regression | Existing 25 acceptance checks plus new cases; responsive/keyboard/console checks |
| 57–60 min | Verify preview startup, update handoff/evidence | Exact implemented/deferred status and runnable commands |

**Cut rule:** stop feature work by minute 44. If the complete claims snapshot is not working, finish the correctness fixes and verification with the existing honest partial-coverage UI. Branding can use spare time but must not replace the test reserve.

## Other useful options, rather than adding all of them

| Option | Rough budget including focused checks | Dependency / tradeoff |
| --- | --- | --- |
| Quick star search directly over the sky | 10–15 min | Reuse the local catalog and Base UI dialog; keyboard results → Find in sky, including below-horizon explanation. Faster discovery without navigating away. |
| Preserve selected star, name-label preference, and catalog filters across in-app navigation | 5–8 min | Extend the existing state/URL layer; keep live time and the initial-location policy unchanged. Current observer/camera already survive client navigation. |
| Retry failed globe coastline loading | 3–5 min | The rejected module-level coastline promise currently remains rejected until reload. Reset/retry the resource and distinguish the graticule-only fallback. |
| Broader accessibility/lifecycle checks | 10–15 min | Add 768/1024 widths, landscape touch, zoom, forced colors, repeated navigation, hidden-tab suspension, delayed auth, and API 429 cases. Actual Safari/device checks require an available target. |
| Existing API signup form | 10–20 min | Signup contract already exists; verify duplicate email, validation, rate limits, cookie session, and return navigation. Useful for onboarding, but it displaces claim coverage or hardening. |
| Read-only constellation overlay | 12–20 min | Use the pinned line geometry and supplemental endpoints; preserve clipping, picking, credits, and reduced-motion behavior. Lower priority than correctness. |
| Production loading/render profiling | 10–15 min | Measure catalog/JS/font bytes, throttled cold load, drag frames, long tasks, and repeated-navigation memory before optimizing. Only Chromium is currently cached; no WebKit runtime was found. |

I would keep guide chat, a complete social-write/moderation UI, geocoding, and advanced effects outside this hour. Model-host configuration is still an external dependency for honest live guide/moderation acceptance. The iOS app is currently a placeholder, so it must not be advertised as a working alternate account/social flow. New logo concepts also deserve their own review rather than being smuggled into a polish pass.

## Evidence and scope

Exploration finished at approximately **5:34 PM PDT**, using about six minutes of the additional hour. It used the existing production export and regular Playwright/Chromium. The initial probes used the isolated preview; final ownership/comment checks ran against a disposable production API instance, with explicit response interception only where stated. No application source, API contract, real user record, brand artifact, or production fixture mode was changed.

Evidence is preserved outside the repository:

- [Ownership and comment results](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/next-hour/next-hour-exploration.json)
- [Gesture handler event sequence](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/next-hour/gesture-handler-exploration.json)
- [Expired ownership screenshot](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/next-hour/explore-stale-ownership.png)
- [Deleted-comment/count mismatch screenshot](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/next-hour/explore-expanded-comments.png)
- [Repeatable disposable-server probe](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/next-hour/explore-next-hour.cjs)

The first broad gesture probe did not establish a one-finger lift; the separately recorded handler probe is the evidence for that finding. The normal pinch-only path passed. No physical-device or Safari claim is made.

The preceding D0–D6 handoff remains the record of its original passing acceptance run. The issues above are additional boundary cases discovered in this review, not claims that those earlier tests covered them. In particular, the in-view list was inspected and is already ordered by brightness; no unnecessary sorting rewrite is proposed.
