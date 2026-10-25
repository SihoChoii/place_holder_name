"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { API_URL } from "@/lib/api";
import styles from "./page.module.css";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, username, password, displayName: username };

      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      localStorage.setItem("stargaze_token", data.token);
      setMessage(`Signed in as @${data.user.username}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        Stargaze
      </Link>
      <h1>{mode === "login" ? "Log in" : "Create account"}</h1>

      <form className={styles.form} onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {mode === "register" && (
          <label>
            Username
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      {message && <p className={styles.message}>{message}</p>}

      <button
        type="button"
        className={styles.switch}
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </main>
  );
}
