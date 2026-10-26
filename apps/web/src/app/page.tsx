import { Suspense } from "react";
import { SkyApp } from "@/sky/sky-app";

export default function HomePage() {
  return <Suspense fallback={<p role="status">Opening the live sky…</p>}><SkyApp /></Suspense>;
}
