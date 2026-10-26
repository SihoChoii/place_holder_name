"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/features/auth/session";

export function SiteHeader() {
  const path = usePathname();
  const session = useSession();
  const [returnTo, setReturnTo] = useState("/");
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="explorer-header">
        <Link href="/" className="wordmark" aria-label="StarTagger home">
          <img
            src="/brand/startagger-symbol-compact-white.svg"
            alt=""
            width={48}
            height={48}
            className="brand-symbol"
          />
          StarTagger
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/" aria-current={path === "/" ? "page" : undefined}>
            Sky
          </Link>
          <Link
            href="/catalog"
            aria-current={path === "/catalog" ? "page" : undefined}
          >
            Catalog
          </Link>
          <Link
            href="/credits"
            aria-current={path === "/credits" ? "page" : undefined}
          >
            Credits
          </Link>
        </nav>
        <div className="account-controls">
          {session.user ? (
            <>
              <span className="account-name">{session.user.display_name}</span>
              <Button
                variant="outline"
                disabled={session.loading}
                onClick={() => void session.logout()}
              >
                Log out
              </Button>
            </>
          ) : (
            <>
            <Link
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              onPointerDown={() =>
                setReturnTo(window.location.pathname + window.location.search)
              }
              onFocus={() =>
                setReturnTo(window.location.pathname + window.location.search)
              }
              className={buttonVariants({ variant: "outline" })}
            >
              Log in
            </Link>
            <Link
              href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}
              onPointerDown={() =>
                setReturnTo(window.location.pathname + window.location.search)
              }
              onFocus={() =>
                setReturnTo(window.location.pathname + window.location.search)
              }
              className={buttonVariants({ variant: "outline" })}
            >
              Sign up
            </Link>
            </>
          )}
        </div>
      </header>
      {session.error && (
        <p className="account-error" role="status">
          {session.error}{" "}
          <Button
            size="sm"
            variant="link"
            onClick={() => void session.refresh()}
          >
            Retry account
          </Button>
        </p>
      )}
    </>
  );
}
