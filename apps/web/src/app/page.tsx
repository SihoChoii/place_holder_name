import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.brand}>Stargaze</span>
        <nav className={styles.links}>
          <Link href="/stars">Stars</Link>
          <Link href="/login">Log in</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.brandHero}>Stargaze</p>
        <h1>Hold up your phone. Meet the night sky.</h1>
        <p className={styles.lede}>
          Camera sky view with GPS, gyroscope, and time-aligned stars — then leave
          photos, notes, and reactions on the stars themselves.
        </p>
        <div className={styles.cta}>
          <Link className={styles.primary} href="/stars">
            Browse stars
          </Link>
          <Link className={styles.secondary} href="/login">
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
