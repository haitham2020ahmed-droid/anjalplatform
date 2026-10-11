/**
 * 🚀 Rocket Race art — original, code-drawn SVG (no images). Pure components (no hooks), so the projector screen
 * and the solo game share them.
 */

/** A small rocket pointing right, drawn around (0, 0); about 44 × 22 units. */
export function Rocket({ color, flame = true, label }: { color: string; flame?: boolean; label?: string }) {
  return (
    <g>
      {label && <title>{label}</title>}
      {flame && (
        <path d="M-20 -5 Q-34 0 -20 5 Q-25 0 -20 -5Z" fill="#fb923c">
          <animate attributeName="d" dur="0.3s" repeatCount="indefinite" values="M-20 -5 Q-34 0 -20 5 Q-25 0 -20 -5Z;M-20 -5 Q-40 0 -20 5 Q-27 0 -20 -5Z;M-20 -5 Q-34 0 -20 5 Q-25 0 -20 -5Z" />
        </path>
      )}
      <path d="M-20 -4 L-14 -11 L-10 -6Z M-20 4 L-14 11 L-10 6Z" fill={color} opacity="0.85" />
      <path d="M-20 -6 H8 Q20 -6 24 0 Q20 6 8 6 H-20Z" fill="#f8fafc" stroke={color} strokeWidth="2" />
      <path d="M8 -6 Q20 -6 24 0 Q20 6 8 6Z" fill={color} />
      <circle cx="0" cy="0" r="3.4" fill="#38bdf8" stroke={color} strokeWidth="1.5" />
    </g>
  );
}

/** The Moon on the right edge of a race of height `h` (x = the finish line). */
export function Moon({ x, h }: { x: number; h: number }) {
  const r = Math.min(70, Math.max(30, h * 0.42));
  return (
    <g aria-hidden="true">
      <circle cx={x + r * 0.55} cy={h / 2} r={r} fill="#fef3c7" />
      <circle cx={x + r * 0.35} cy={h / 2 - r * 0.35} r={r * 0.16} fill="#fde68a" />
      <circle cx={x + r * 0.75} cy={h / 2 + r * 0.3} r={r * 0.22} fill="#fde68a" />
      <circle cx={x + r * 0.2} cy={h / 2 + r * 0.45} r={r * 0.1} fill="#fde68a" />
      <line x1={x} x2={x} y1={4} y2={h - 4} stroke="#fde68a" strokeWidth="2" strokeDasharray="4 5" />
    </g>
  );
}

/** A few fixed stars (no randomness, so server and browser draw the same picture). */
export function Stars({ w, h }: { w: number; h: number }) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) pts.push([((i * 97) % 100) / 100 * w, ((i * 53 + 17) % 100) / 100 * h, i % 3 === 0 ? 1.6 : 0.9]);
  return <g aria-hidden="true" fill="#e2e8f0">{pts.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} opacity={i % 2 ? 0.5 : 0.9} />)}</g>;
}

export const ROCKET_COLORS = ["#7c3aed", "#0d9488", "#e11d48", "#2563eb", "#ea580c", "#16a34a", "#db2777", "#0891b2", "#ca8a04", "#4f46e5"] as const;
