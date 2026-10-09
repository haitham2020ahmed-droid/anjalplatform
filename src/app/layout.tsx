import type { Metadata } from "next";
import "./globals.css";
import { Pwa } from "@/components/ui/pwa";

export const metadata: Metadata = { title: { default: "Al-Anjal English", template: "%s · Al-Anjal English" }, description: "Adaptive English practice — Al-Anjal Private Schools", manifest: "/manifest.webmanifest", icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }, appleWebApp: { capable: true, title: "Al-Anjal", statusBarStyle: "default" } };
export const viewport = { themeColor: "#1f3a68" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}<Pwa /></body>
    </html>
  );
}
