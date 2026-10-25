import Link from "next/link";
import type { Media, Star } from "@stargaze/shared";
import { apiFetch } from "@/lib/api";
import styles from "./page.module.css";

type Props = { params: Promise<{ id: string }> };

export default async function StarDetailPage({ params }: Props) {
  const { id } = await params;

  let star: Star | null = null;
  let media: Media[] = [];

  try {
    const starRes = await apiFetch<{ star: Star }>(`/stars/${id}`);
    star = starRes.star;
    const mediaRes = await apiFetch<{ media: Media[] }>(`/stars/${id}/media`);
    media = mediaRes.media;
  } catch {
    star = null;
  }

  if (!star) {
    return (
      <main className={styles.page}>
        <p>Star not found.</p>
        <Link href="/stars">Back</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link href="/stars" className={styles.back}>
        ← Stars
      </Link>
      <h1>{star.name}</h1>
      <p className={styles.meta}>
        {star.constellation ?? "Unknown constellation"}
        {star.magnitude != null ? ` · magnitude ${star.magnitude.toFixed(2)}` : ""}
        <br />
        RA {star.raHours.toFixed(3)}h · Dec {star.decDegrees.toFixed(3)}°
      </p>

      <h2>Shared media</h2>
      {media.length === 0 ? (
        <p className={styles.empty}>Nothing attached yet — open the iOS app and leave the first note.</p>
      ) : (
        <ul className={styles.media}>
          {media.map((item) => (
            <li key={item.id}>
              <div className={styles.card}>
                <span className={styles.type}>{item.type}</span>
                <p>{item.body ?? item.mediaUrl ?? "—"}</p>
                <span className={styles.author}>
                  @{item.author?.username ?? "unknown"}
                  {item.reactionCount ? ` · ${item.reactionCount} reactions` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
