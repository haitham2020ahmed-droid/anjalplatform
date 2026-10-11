"use client";
/**
 * 🎞 A requestAnimationFrame loop for Lane Runner: `cb(dt)` every frame while `running`, with dt clamped (no jump after a
 * slow frame) and the loop STOPPED while the tab is hidden (it starts again, without a jump, when the tab is back).
 * The callback moves elements through refs, so a frame never re-renders React.
 */
import { useEffect, useRef } from "react";

export function useFrame(cb: (dt: number) => void, running: boolean): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!running || typeof window === "undefined") return;
    let id = 0, last = 0;
    const tick = (t: number) => {
      const dt = last ? Math.min(0.05, Math.max(0, (t - last) / 1000)) : 0;
      last = t;
      ref.current(dt);
      id = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(id); last = 0; if (!document.hidden) id = requestAnimationFrame(tick); };
    const onVis = () => { if (document.hidden) cancelAnimationFrame(id); else start(); };
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => { cancelAnimationFrame(id); document.removeEventListener("visibilitychange", onVis); };
  }, [running]);
}

/** visual randomness only (crypto source keeps the platform free of Math.random) */
export const rand = (): number => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };

export function shuffled<T>(arr: readonly T[], rnd: () => number = rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
