"use client";
/**
 * The live connection of a Live Challenge screen: Server-Sent Events (small JSON pushed by the server); the browser
 * reconnects by itself after a dropped connection and gets the current state at once (rejoin). If the stream cannot
 * connect at all (an old browser or a strict proxy), it falls back to asking every 2 seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useLiveFeed<T>(key: string, as: "host" | "player", initial: T): { view: T; setView: (v: T) => void; online: boolean; closed: boolean; refresh: () => Promise<void> } {
  const [view, setView] = useState<T>(initial);
  const [online, setOnline] = useState(true);
  const [closed, setClosed] = useState(false);
  const fails = useRef(0);
  const url = `/api/live/${encodeURIComponent(key)}`;
  const q = as === "host" ? "?as=host" : "";

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${url}${q}`, { cache: "no-store" });
      if (r.ok) { setView(await r.json()); setOnline(true); }
      else if (r.status === 403) setClosed(true);
    } catch { setOnline(false); }
  }, [url, q]);

  useEffect(() => {
    let es: EventSource | null = null, poll: ReturnType<typeof setInterval> | null = null, gotAny = false;
    const startPolling = () => { if (!poll) poll = setInterval(refresh, 2000); };
    if (typeof EventSource === "undefined") { startPolling(); return () => { if (poll) clearInterval(poll); }; }
    es = new EventSource(`${url}/stream${q}`);
    es.onmessage = (e) => {
      gotAny = true; fails.current = 0; setOnline(true);
      try { const v = JSON.parse(e.data); if (v && v.closed) { setClosed(true); es?.close(); return; } setView(v); } catch { /* ignore */ }
    };
    es.onerror = () => {
      setOnline(false);
      fails.current++;
      // never connected after a few tries: switch to polling (the stream keeps retrying by itself otherwise)
      if (!gotAny && fails.current >= 3) { es?.close(); startPolling(); }
    };
    return () => { es?.close(); if (poll) clearInterval(poll); };
  }, [url, q, refresh]);

  return { view, setView, online, closed, refresh };
}

export async function livePost<T = unknown>(key: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const r = await fetch(`/api/live/${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json() };
  } catch { return { ok: false, data: { error: "offline" } as T & { error?: string } }; }
}

/** 1st, 2nd, 3rd… (English); Arabic shows the number. */
export const ordinal = (n: number, lang: string): string => {
  if (lang === "ar") return String(n);
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
