"use client";
import { useEffect } from "react";
import { useAdminErrorDetail } from "@/components/ui/admin-error-detail";

/**
 * Last-resort error page: shown when the ROOT layout itself fails (error.tsx cannot catch that).
 * It replaces the whole document, so it renders its own <html>/<body> and uses inline styles
 * (the app's stylesheet may not have loaded). Reports to the same error log as error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // admins: the real message behind the reference (the server answers admins only)
  const detail = useAdminErrorDetail(error.digest);
  useEffect(() => {
    console.error(error);
    try { void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }) }); } catch { /* offline */ }
  }, [error]);
  const stale = /Failed to find Server Action|older or newer deployment/i.test(error.message);
  const btn = { borderRadius: 12, padding: "10px 20px", fontWeight: 600, fontSize: 16, cursor: "pointer", textDecoration: "none" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "'Hanken Grotesk', system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24, boxSizing: "border-box" }}>
        <main style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 24, padding: 32, textAlign: "center", boxShadow: "0 4px 16px rgba(15,23,42,.08)", border: "1px solid #e2e8f0" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#1f3a68" }}>{stale ? "The platform was just updated" : "Something went wrong"}</h1>
          <p style={{ marginTop: 8, color: "#475569" }}>{stale ? "Reload the page to get the new version. Your work is saved." : "Please try again. If it keeps happening, tell your teacher."}</p>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12 }}>
            <button onClick={() => (stale ? window.location.reload() : reset())} style={{ ...btn, border: "none", background: "#1f3a68", color: "#fff" }}>{stale ? "Reload" : "Try again"}</button>
            <a href="/" style={{ ...btn, color: "#1f3a68", border: "1px solid #cbd5e1" }}>Home</a>
          </div>
          {detail && (
            <div style={{ marginTop: 16, borderRadius: 12, background: "#fffbeb", padding: 12, textAlign: "start", fontSize: 12, color: "#451a03", border: "1px solid #fde68a" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>What went wrong (only admins see this)</p>
              <p dir="ltr" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>{detail}</p>
            </div>
          )}
          {error.digest && <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8" }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
