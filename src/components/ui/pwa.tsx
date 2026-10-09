"use client";
import { useEffect } from "react";

/** Registers the service worker (add to home screen, offline page, fast static files). Production only. */
export function Pwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
