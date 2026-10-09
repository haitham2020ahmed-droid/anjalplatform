import type { Metadata } from "next";
import "./globals.css";
import { Lexend } from "next/font/google";
import { Pwa } from "@/components/ui/pwa";

export const metadata: Metadata = { title: { default: "Al-Anjal English", template: "%s · Al-Anjal English" }, description: "Adaptive English practice — Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Al-Anjal", statusBarStyle: "default" } };
/** Lexend: a typeface designed to make reading easier — fitting for a reading platform; self-hosted at build. */
const lexend = Lexend({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], display: "swap", variable: "--font-lexend" });

export const viewport = { themeColor: "#1f3a68" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={lexend.variable}>
      <body className="min-h-screen">{children}<Pwa /></body>
    </html>
  );
}
