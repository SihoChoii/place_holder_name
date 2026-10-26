"use client";
import { useState } from "react";
import Link from "next/link";
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

export function SignupPage() {
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returnTo = params.get("returnTo");
  return (
    <main id="main-content" className="login-main">
      <h1>Create your account.</h1>
      <p>Sign up to react, comment and ask the star guide.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await request("/auth/signup", schemas.AuthResponse, {
              method: "POST",
              body: JSON.stringify({
                email,
                password,
                display_name: displayName.trim(),
              }),
            });
            setPassword("");
            await session.refresh();
            router.replace(internalReturn(returnTo));
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
            <FieldLabel htmlFor="signup-name">Display name</FieldLabel>
            <Input
              id="signup-name"
              type="text"
              autoComplete="nickname"
              required
              maxLength={LIMITS.displayNameMax}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "signup-error" : undefined}
            />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="signup-email">Email</FieldLabel>
            <Input
              id="signup-email"
              type="email"
              autoComplete="username"
              required
              maxLength={LIMITS.emailMax}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "signup-error" : undefined}
            />
          </Field>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="signup-password">Password</FieldLabel>
            <Input
              id="signup-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={LIMITS.passwordMin}
              maxLength={LIMITS.passwordMax}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "signup-error" : undefined}
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
              At least {LIMITS.passwordMin} characters.
            </FieldDescription>
          </Field>
          {error && (
            <p id="signup-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </FieldGroup>
      </form>
      <p>
        Already have an account?{" "}
        <Link
          href={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          className="text-link"
        >
          Log in
        </Link>
      </p>
    </main>
  );
}
