"use client";
import Link from "next/link";
import type { SkyStar } from "@/lib/catalog";
import { ownership, usePublicStar } from "@/lib/api/public-star";
import { starHref } from "@/lib/api/client";
import { Button, buttonVariants } from "@/components/ui/button";

export function StarPreview({ star }: { star: SkyStar }) {
  const state = usePublicStar(star.id);
  const tag =
    state.data && !state.error ? state.data.recent_tags[0] : undefined;
  return (
    <div className="preview-body">
      <p className="muted-text">
        {star.constellation} · HYG {star.id}
      </p>
      <p className="ownership" aria-live="polite">
        {state.loading ? "Checking ownership…" : ownership(state)}
      </p>
      {state.error ? (
        <div role="status">
          <p>Ownership unavailable. {state.error.message}</p>
          <Button variant="link" onClick={() => void state.retry()}>
            Retry ownership
          </Button>
        </div>
      ) : state.data?.star.claim && !tag ? (
        <p className="muted-text">No approved posts yet.</p>
      ) : tag ? (
        <>
          <p className="post-excerpt">
            {tag.note?.slice(0, 140) || "Approved media on this star."}
          </p>
          <p className="muted-text">
            {state.data?.tag_count} approved{" "}
            {state.data?.tag_count === 1 ? "post" : "posts"}
          </p>
        </>
      ) : null}
      <dl className="preview-facts">
        <div>
          <dt>Magnitude</dt>
          <dd>{star.magnitude.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>
            {star.distanceLightYears === null
              ? "Unknown"
              : `${star.distanceLightYears.toLocaleString()} ly`}
          </dd>
        </div>
      </dl>
      <Link className={buttonVariants()} href={starHref(star.id)}>
        Open star page
      </Link>
    </div>
  );
}
