import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="page-width detail-main">
      <h1>This part of the sky is empty.</h1>
      <p>The page could not be found.</p>
      <Link className="text-link" href="/">
        Return to the sky
      </Link>
    </main>
  );
}
