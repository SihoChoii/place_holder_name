"use client";
import { useEffect, useState } from "react";
import {
  schemas,
  REACTION_EMOJIS,
  type Tag,
  type Page,
  type Comment,
  type MediaItem,
} from "@stargaze/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { request } from "@/lib/api/client";

export function dateLabel(time: number) {
  return new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function safeLink(value: string) {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      !u.username &&
      !u.password
      ? u
      : null;
  } catch {
    return null;
  }
}
function PublicMedia({
  media,
  note,
}: {
  media: MediaItem;
  note: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (media.kind === "link") {
    const url = safeLink(media.url);
    return url ? (
      <a
        className="public-link"
        href={url.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {url.hostname}
        <span>Open link ↗</span>
      </a>
    ) : (
      <p>Link unavailable.</p>
    );
  }
  if (!/^\/api\/public\/media\/[a-f0-9-]+$/i.test(media.url) || failed)
    return <p role="status">Image unavailable.</p>;
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="image-trigger"
            aria-label="Open full-size photo"
          />
        }
      >
        <img
          src={media.url}
          alt={note ?? "Photo shared by this star’s owner"}
          width={media.width}
          height={media.height}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Star photo</DialogTitle>
        </DialogHeader>
        <img
          className="full-image"
          src={media.url}
          alt={note ?? "Photo shared by this star’s owner"}
        />
        {note && <p>{note}</p>}
      </DialogContent>
    </Dialog>
  );
}
function PublicPost({ tag }: { tag: Tag }) {
  const [comments, setComments] = useState<Page<Comment> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function loadComments(cursor?: string) {
    setBusy(true);
    setError("");
    try {
      const page = await request<Page<Comment>>(
        `/public/tags/${tag.id}/comments?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        schemas.CommentPage,
      );
      setComments((previous) => ({
        items: cursor
          ? [...(previous?.items ?? []), ...page.items]
          : page.items,
        next_cursor: page.next_cursor,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = (comments?.items ?? tag.recent_comments ?? []).filter(
    (c) => c.moderation_status === "approved",
  );
  return (
    <article className="public-post">
      <header>
        <strong>{tag.author.display_name}</strong>
        <time dateTime={new Date(tag.created_at).toISOString()}>
          {dateLabel(tag.created_at)}
        </time>
      </header>
      {tag.note && <p className="post-note">{tag.note}</p>}
      <div className="post-media">
        {tag.media.map((media) => (
          <PublicMedia key={media.id} media={media} note={tag.note} />
        ))}
      </div>
      <div className="post-counts" aria-label="Reactions and comments">
        {REACTION_EMOJIS.filter((emoji) => tag.reaction_counts[emoji] > 0).map(
          (emoji) => (
            <span key={emoji}>
              {emoji} {tag.reaction_counts[emoji]}
            </span>
          ),
        )}
        <span>
          {tag.comment_count} {tag.comment_count === 1 ? "comment" : "comments"}
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="public-comments">
          {shown.map((c) => (
            <li key={c.id}>
              <strong>{c.author.display_name}</strong>
              <p>{c.body}</p>
              <time dateTime={new Date(c.created_at).toISOString()}>
                {dateLabel(c.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {((!comments && tag.comment_count > shown.length) ||
        comments?.next_cursor) && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void loadComments(comments?.next_cursor ?? undefined)}
        >
          {busy
            ? "Loading comments…"
            : comments
              ? "More comments"
              : "Read all comments"}
        </Button>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <Button
            variant="link"
            onClick={() =>
              void loadComments(comments?.next_cursor ?? undefined)
            }
          >
            Retry comments
          </Button>
        </p>
      )}
    </article>
  );
}
export function PublicPosts({
  id,
  initial,
  count,
}: {
  id: number;
  initial: Tag[];
  count: number;
  updated?: number;
}) {
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [page, setPage] = useState<Page<Tag> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cursor === undefined) return;
    let stopped = false,
      running = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const load = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      setBusy(true);
      try {
        const result = await request<Page<Tag>>(
          `/public/stars/${id}/tags?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          schemas.TagPage,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          },
        );
        if (!stopped) {
          setPage(result);
          setError("");
        }
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setPage(null);
        }
      } finally {
        running = false;
        if (!stopped) {
          setBusy(false);
          if (!document.hidden) timer = setTimeout(load, 5000);
        }
      }
    };
    const visible = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    setPage(null);
    void load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, cursor, attempt]);
  const tags = (cursor === undefined ? initial : (page?.items ?? [])).filter(
    (t) => t.moderation_status === "approved" && t.hyg_id === id,
  );
  return (
    <>
      {cursor !== undefined && (
        <Button
          variant="link"
          onClick={() => {
            setCursor(undefined);
            setPage(null);
            setError("");
          }}
        >
          Back to newest posts
        </Button>
      )}
      {tags.map((tag) => (
        <PublicPost key={tag.id} tag={tag} />
      ))}
      {busy && !page && cursor !== undefined && (
        <p role="status">Loading posts…</p>
      )}
      {((cursor === undefined && count > initial.length) ||
        page?.next_cursor) && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setCursor(
              cursor === undefined ? null : (page?.next_cursor ?? undefined),
            )
          }
        >
          {busy
            ? "Loading posts…"
            : cursor === undefined
              ? "Read all posts"
              : "Earlier posts"}
        </Button>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <Button variant="link" onClick={() => setAttempt((n) => n + 1)}>
            Retry posts
          </Button>
        </p>
      )}
    </>
  );
}
