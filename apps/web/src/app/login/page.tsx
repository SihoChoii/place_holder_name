import { Suspense } from "react";
import { LoginPage } from "@/features/auth/login-page";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading login…</p>}>
      <LoginPage />
    </Suspense>
  );
}
