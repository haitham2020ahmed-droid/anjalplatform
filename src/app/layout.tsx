import type { Metadata } from "next";
import "./globals.css";
import { Pwa } from "@/components/ui/pwa";
import { I18nProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";
import { dirOf } from "@/i18n";
import { getTheme } from "@/server/ui/theme";

export const metadata: Metadata = { title: { default: "Literise", template: "%s · Literise" }, applicationName: "Literise", description: "Literise — the English Language Arts platform of Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: [{ url: "/brand/literise-mark.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png" }], apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Literise", statusBarStyle: "default" } };
/**
 * Fonts (Literise D1): loaded via a plain <link> to Google Fonts' CSS2 API in the <head> below, NOT next/font/google.
 *
 * Why: next/font/google downloads the font files during `next build` itself (to self-host them, for a faster first
 * paint with no runtime request to Google). That means the BUILD machine needs working network access to Google's
 * font servers at that exact moment. On Render's Docker build step, that access was failing consistently — not a
 * one-off network blip — and crashed the whole build with "Cannot read properties of null" inside next/font's
 * Google CSS parser (it got back something it couldn't parse). A plain <link rel="stylesheet"> below moves that
 * font request to each VISITOR's own browser at page-load time (the same way the vast majority of websites load
 * Google Fonts, and the same way this app worked before next/font/google was introduced) — so the build itself
 * never talks to Google at all, and can never fail this way again, regardless of Render's network to Google.
 *
 * Hanken Grotesk = the interface (body, buttons, tables) · Young Serif = H1 / H2, big numbers and the Literise wordmark
 * (one weight) · IBM Plex Sans Arabic = the Arabic interface (body and headings) and the Arabic line of the school logo
 * (Arabic letters only) · Nunito = the Curriculum Map page only (a friendlier, rounder font — see .curriculum-map-ui
 * in globals.css), to match the reference skill-plan screenshot the owner asked us to follow. · Lexend = the optional
 * dyslexia-friendly font (DyslexicFontToggle): wider letter shapes designed to reduce visual crowding/confusable
 * letters; only takes visual effect once html[data-dyslexic-font="1"] is set (globals.css) — off by default, a
 * student turns it on for themselves.
 *
 * No CSS variable juggling is needed here: globals.css already falls back to each font's literal family name
 * (e.g. `var(--font-hanken), "Hanken Grotesk", ...`) for exactly this case — once --font-hanken etc. are no longer
 * defined by next/font, those var() calls resolve straight to the literal name, which matches the family loaded
 * by the <link> below.
 */
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Young+Serif&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Nunito:wght@400;500;600;700;800&family=Lexend:wght@400;500;600;700&display=swap";

export const viewport = { themeColor: "#232a6e" };

/** <html lang dir> follow the interface language (English default; Arabic = right-to-left); data-theme = day | night | system. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  return (
    <html lang={lang} dir={dirOf(lang)} data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="min-h-screen"><I18nProvider lang={lang}>{children}</I18nProvider><Pwa /></body>
    </html>
  );
}
