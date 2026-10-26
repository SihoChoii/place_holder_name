import { Suspense } from "react";
import { SignupPage } from "@/features/auth/signup-page";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading sign up…</p>}>
      <SignupPage />
    </Suspense>
  );
}
