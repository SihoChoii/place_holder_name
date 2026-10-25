import Link from "next/link";
import type { Star } from "@stargaze/shared";
import { apiFetch } from "@/lib/api";
import styles from "./page.module.css";

async function getStars(): Promise<Star[]> {
  try {
    const data = await apiFetch<{ stars: Star[] }>("/stars?limit=50");
    return data.stars;
  } catch {
    return [];
  }
}

export default async function StarsPage() {
  const stars = await getStars();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Stargaze
        </Link>
        <h1>Star catalog</h1>
        <p>Media and reactions attach to these objects from the iOS sky view.</p>
      </header>

      {stars.length === 0 ? (
        <p className={styles.empty}>
          No stars yet. Start the API and run <code>pnpm --filter @stargaze/api seed</code>.
        </p>
      ) : (
        <ul className={styles.list}>
          {stars.map((star) => (
            <li key={star.id}>
              <Link href={`/stars/${star.id}`} className={styles.row}>
                <span className={styles.name}>{star.name}</span>
                <span className={styles.meta}>
                  {star.constellation ?? "—"}
                  {star.magnitude != null ? ` · mag ${star.magnitude.toFixed(2)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
