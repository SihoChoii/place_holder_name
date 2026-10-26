"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { schemas, LIMITS } from "@stargaze/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { internalReturn, request, RequestError } from "@/lib/api/client";
import { useSession } from "./session";

export function LoginPage() {
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main id="main-content" className="login-main">
      <h1>Welcome back.</h1>
      <p>Log in to your StarTagger account.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await request("/auth/login", schemas.AuthResponse, {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            setPassword("");
            await session.refresh();
            router.replace(internalReturn(params.get("returnTo")));
          } catch (e) {
            setError(
              `${(e as Error).message}${e instanceof RequestError && e.retryAfter ? ` Try again in ${e.retryAfter} seconds.` : ""}`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              maxLength={LIMITS.emailMax}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
            />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={LIMITS.passwordMax}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Hide password" : "Show password"}
            </Button>
            <FieldDescription>
              Use your existing StarTagger account.
            </FieldDescription>
          </Field>
          {error && (
            <p id="login-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
