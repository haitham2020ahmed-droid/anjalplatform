import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anjal Adaptive ELA",
  description: "Adaptive learning platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
