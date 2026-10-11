"use client";
/** 🎉 A small confetti burst (CSS shapes moved with the Web Animations API; nothing to download). */
/** visual jitter only (crypto source keeps the platform free of Math.random) */
const rand = (): number => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#facc15"];

export function confetti(opts: { pieces?: number; from?: HTMLElement | null } = {}): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const n = Math.min(80, opts.pieces ?? 28);
  const r = opts.from?.getBoundingClientRect();
  const x0 = r ? r.left + r.width / 2 : window.innerWidth / 2, y0 = r ? r.top + r.height / 3 : window.innerHeight / 3;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "60", overflow: "hidden" });
  document.body.appendChild(layer);
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    const size = 6 + rand() * 6;
    Object.assign(p.style, { position: "absolute", left: `${x0}px`, top: `${y0}px`, width: `${size}px`, height: `${size * 0.6}px`, background: COLORS[i % COLORS.length], borderRadius: i % 3 ? "2px" : "50%" });
    layer.appendChild(p);
    const angle = rand() * Math.PI * 2, dist = 80 + rand() * 160;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist * 0.6 - 60;
    p.animate([
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rand() * 540}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx * 1.1}px, ${dy + 160}px) rotate(${rand() * 720}deg)`, opacity: 0 },
    ], { duration: 900 + rand() * 500, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
  }
  setTimeout(() => layer.remove(), 1600);
}
