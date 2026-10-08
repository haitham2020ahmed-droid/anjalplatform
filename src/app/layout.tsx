import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Al-Anjal English", template: "%s · Al-Anjal English" }, description: "Adaptive English practice — Al-Anjal Private Schools" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
