import { Suspense } from "react";
import { StarPage } from "@/features/stars/star-page";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading star details…</p>}>
      <StarPage />
    </Suspense>
  );
}
