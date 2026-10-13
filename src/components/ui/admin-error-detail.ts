"use client";
import { useEffect, useState } from "react";

/**
 * 🩺 For the school admin / platform admin only: the server's real message behind an error page's "Reference" (the
 * server decides who may see it — anyone else gets nothing). The error log is written while the page opens, so it
 * asks twice. Used by app/error.tsx and app/global-error.tsx.
 */
export function useAdminErrorDetail(digest: string | undefined): string | null {
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    if (!digest) return;
    let off = false;
    const ask = async (wait: number) => {
      await new Promise((r) => setTimeout(r, wait));
      if (off) return true;
      try {
        const r = await fetch(`/api/admin/error-detail?digest=${encodeURIComponent(digest)}`, { cache: "no-store" });
        if (r.status !== 200) return false;
        const j = (await r.json()) as { message?: string };
        if (!off && j.message) setDetail(j.message);
        return true;
      } catch { return true; }
    };
    void (async () => { if (!(await ask(300))) await ask(2000); })();
    return () => { off = true; };
  }, [digest]);
  return detail;
}
