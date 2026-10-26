import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { SessionProvider } from "@/features/auth/session";
import { SiteHeader } from "@/features/site-header";
import { ObserverProvider } from "@/sky/observer";

export const metadata: Metadata = {
  title: "Stargaze",
  description: "A simple way to explore the stars. Browse the catalog, save stars, and keep your observations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SessionProvider><ObserverProvider><SiteHeader />{children}</ObserverProvider></SessionProvider></body>
    </html>
  );
}
