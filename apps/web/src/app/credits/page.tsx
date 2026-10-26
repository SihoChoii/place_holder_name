import Link from "next/link";
import { CreditsContent } from "@/features/credits";
export default function Page() {
  return (
    <main id="main-content" className="page-width credits-main">
      <Link href="/" className="text-link">
        Back to sky
      </Link>
      <h1>Credits &amp; about</h1>
      <p className="credits-intro">
        Explore the stars, save your favorites, and keep your observations with StarTagger.
      </p>
      <CreditsContent />
    </main>
  );
}
