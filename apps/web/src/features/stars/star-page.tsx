"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCatalog, type SkyStar } from "@/lib/catalog";
import { formatDec, formatRA } from "@/lib/star-catalog";
import { usePublicStar, ownership, isFresh } from "@/lib/api/public-star";
import { starHref } from "@/lib/api/client";
import { PublicPosts, dateLabel } from "./public-posts";
import { GuideChat } from "@/features/guide/guide-chat";
import { StarBlurb } from "@/features/guide/star-blurb";

const number = (v: number | null, unit = "") =>
  v === null
    ? "Unknown"
    : `${v.toLocaleString("en-US", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
function Facts({ star }: { star: SkyStar }) {
  const estimated = star.estimated ? " (estimated)" : "";
  const rows = [
    ["Distance", number(star.distanceLightYears, "light years")],
    ["Apparent magnitude", star.magnitude.toFixed(2)],
    ["Spectral type", star.spectralType ?? "Unknown"],
    ["Right ascension (J2000)", formatRA(star.raDegrees)],
    ["Declination (J2000)", formatDec(star.decDegrees)],
    ["Visual luminosity", number(star.luminosity, "L☉")],
    [`Temperature${estimated}`, number(star.temperature, "K")],
    [`Radius${estimated}`, number(star.radius, "R☉")],
    [`Mass${estimated}`, number(star.mass, "M☉")],
    [
      `Surface gravity${star.gravity === null ? " (estimated)" : ""}`,
      number(star.gravity ?? star.estimatedGravity, "m/s²"),
    ],
    ["Known exoplanets", String(star.planetCount)],
  ];
  return (
    <section aria-labelledby="facts-heading">
      <h2 id="facts-heading">Star facts</h2>
      <dl className="measurements facts-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {star.planets.length > 0 && (
        <p className="planet-names">{star.planets.join(", ")}</p>
      )}
      <p className="muted-text">
        HYG v4.4 and NASA Exoplanet Archive. Estimated values are approximate;
        visual luminosity is not bolometric.
      </p>
      <Link className="text-link" href="/credits">
        Data sources and limitations
      </Link>
    </section>
  );
}
export function StarPage() {
  const params = useSearchParams(),
    catalog = useCatalog();
  const raw = params.get("hyg_id");
  const id =
    raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))
      ? Number(raw)
      : null;
  const star = id === null ? undefined : catalog.data?.byId.get(id);
  const state = usePublicStar(
    id !== null && (!catalog.data || star) ? id : null,
  );
  const [copied, setCopied] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (star) document.title = `${star.name} · Stargaze`;
    return () => {
      document.title = "Stargaze";
    };
  }, [star]);
  if (id === null || (catalog.data && !star) || state.error?.status === 404)
    return (
      <main id="main-content" className="page-width detail-main">
        <h1>Star not found</h1>
        <p>Choose a star from the pinned HYG catalog.</p>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/catalog"
        >
          Browse catalog
        </Link>
      </main>
    );
  const apiStar = state.data?.star;
  return (
    <main id="main-content" className="page-width detail-main">
      <Link href="/" className="text-link">
        Back to sky
      </Link>
      <header className="public-star-heading">
        <div>
          <p className="muted-text">
            {star?.constellation ?? apiStar?.constellation ?? "Star details"} ·
            HYG {id}
            {star?.hipId ? ` · HIP ${star.hipId}` : ""}
          </p>
          <h1>{star?.name ?? apiStar?.name ?? `HYG ${id}`}</h1>
          <p className="ownership" aria-live="polite">
            {state.loading ? "Checking ownership…" : ownership(state)}
          </p>
          {isFresh(state) && apiStar?.claim && (
            <p className="muted-text">
              Claimed {dateLabel(apiStar.claim.claimed_at)}. Star Tagger
              ownership is a community claim.
            </p>
          )}
          {isFresh(state) && apiStar && !apiStar.claim && (
            <p className="muted-text">
              This star has no recorded owner.
            </p>
          )}
        </div>
        <div className="star-page-actions">
          <Link href={`/?star=${id}`} className={buttonVariants()}>
            Find in sky
          </Link>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  new URL(starHref(id), window.location.origin).href,
                );
                setCopied("Link copied.");
              } catch {
                setCopied(
                  "Copy the address from your browser to share this star.",
                );
              }
            }}
          >
            Copy link
          </Button>
          <Button variant="outline" onClick={() => setShowGuide(!showGuide)}>
            {showGuide ? "Close guide" : "Ask guide"}
          </Button>
          <span role="status">{copied}</span>
        </div>
      </header>
      {showGuide && id && (
        <div className="guide-chat-container">
          <GuideChat
            mode="local"
            scopeHygIds={[id]}
            selectedHygId={id}
            onClose={() => setShowGuide(false)}
          />
        </div>
      )}
      {state.error && (
        <div className="inline-error" role="alert">
          <p>
            Ownership and community content are unavailable.{" "}
            {state.error.message}
          </p>
          {state.updated && (
            <p>
              Last successful check:{" "}
              {new Date(state.updated).toLocaleTimeString()}.
            </p>
          )}
          <Button variant="outline" onClick={() => void state.retry()}>
            Retry community
          </Button>
        </div>
      )}
      <div className="public-star-layout">
        <section aria-labelledby="posts-heading">
          <div className="section-heading">
            <h2 id="posts-heading">Approved posts</h2>
            {state.data && !state.error && (
              <span className="muted-text">{state.data.tag_count}</span>
            )}
          </div>
          {state.loading ? (
            <p role="status">Loading public content…</p>
          ) : state.error ? (
            <p>Public content could not be checked.</p>
          ) : state.data?.tag_count === 0 ? (
            <div className="empty-posts">
              <h3>No approved posts yet.</h3>
              <p>
                {apiStar?.claim
                  ? "This star has an owner, but nothing approved is public yet."
                  : "An owner’s approved photos, links, and notes will appear here."}
              </p>
            </div>
          ) : state.data ? (
            <PublicPosts
              id={id}
              initial={state.data.recent_tags}
              count={state.data.tag_count}
              updated={state.updated}
            />
          ) : null}
        </section>
        <aside>
          {star ? (
            <>
              <Facts star={star} />
              {id && <StarBlurb hygId={id} />}
            </>
          ) : catalog.error ? (
            <div role="alert">
              <p>{catalog.error}</p>
              <Button variant="outline" onClick={catalog.retry}>
                Retry facts
              </Button>
            </div>
          ) : (
            <p role="status">Loading catalog facts…</p>
          )}
        </aside>
      </div>
    </main>
  );
}
