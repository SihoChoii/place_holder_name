import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { SessionProvider } from "@/features/auth/session";
import { SiteHeader } from "@/features/site-header";
import { ObserverProvider } from "@/sky/observer";

export const metadata: Metadata = {
  title: "StarTagger",
  description: "Explore the stars, save your favorites, and keep your observations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SessionProvider><ObserverProvider><SiteHeader />{children}</ObserverProvider></SessionProvider></body>
    </html>
  );
}
