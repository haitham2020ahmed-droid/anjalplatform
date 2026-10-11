/**
 * 🧑‍🚀 Code-drawn avatars, badge emblems and the coin (Games Part 3). Pure SVG, no hooks and no images, so they work in
 * server AND client components (top bar, Avatar Shop, badges page, teacher class list, games and the Live Board).
 * Every character and accessory here is original artwork drawn for this platform.
 *
 *   <Avatar avatar={{ base: "fox", color: "teal", hat: "cap", glasses: null }} size={40} />
 *   <BadgeEmblem code="quiz-whiz" size={20} />      // the student's favorite badge
 *   <CoinIcon size={16} />
 */
import { itemByCode, toAvatar, type AvatarConfig } from "@/lib/avatar";
import { badgeByCode } from "@/lib/badge-catalog";

const INK = "#1e293b";

function mix(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}
const star = (cx: number, cy: number, R: number, r: number, n = 5) =>
  Array.from({ length: n * 2 }, (_, i) => { const a = (Math.PI / n) * i - Math.PI / 2, d = i % 2 ? r : R; return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`; }).join(" ");

const Eyes = ({ y = 54, r = 6, x1 = 40, x2 = 60 }: { y?: number; r?: number; x1?: number; x2?: number }) => (
  <g>
    <circle cx={x1} cy={y} r={r} fill="#fff" /><circle cx={x2} cy={y} r={r} fill="#fff" />
    <circle cx={x1 + 1} cy={y + 1} r={r * 0.55} fill={INK} /><circle cx={x2 + 1} cy={y + 1} r={r * 0.55} fill={INK} />
    <circle cx={x1 + 2} cy={y - 1} r={r * 0.2} fill="#fff" /><circle cx={x2 + 2} cy={y - 1} r={r * 0.2} fill="#fff" />
  </g>
);
const Smile = ({ y = 67, w = 6 }: { y?: number; w?: number }) => <path d={`M${50 - w} ${y} Q50 ${y + 5} ${50 + w} ${y}`} stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />;
const Cheeks = ({ y = 64 }: { y?: number }) => <g fill="#fb7185" opacity={0.35}><circle cx={31} cy={y} r={4} /><circle cx={69} cy={y} r={4} /></g>;

function Base({ base, c }: { base: string; c: string }) {
  const d = mix(c, -0.3), l = mix(c, 0.6);
  switch (base) {
    case "cat": return (<g>
      <path d="M24 46 L28 16 L46 32 Z" fill={c} /><path d="M76 46 L72 16 L54 32 Z" fill={c} />
      <path d="M29 38 L31 23 L41 32 Z" fill="#fda4af" /><path d="M71 38 L69 23 L59 32 Z" fill="#fda4af" />
      <circle cx={50} cy={56} r={28} fill={c} /><ellipse cx={50} cy={66} rx={11} ry={7} fill={l} />
      <path d="M47 62 h6 l-3 3.5 z" fill="#f43f5e" />
      <g stroke={d} strokeWidth={1.6} strokeLinecap="round"><path d="M37 65 L21 62" /><path d="M37 68 L21 71" /><path d="M63 65 L79 62" /><path d="M63 68 L79 71" /></g>
      <Eyes /><path d="M46 68 Q50 71 54 68" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" /><Cheeks />
    </g>);
    case "bear": return (<g>
      <circle cx={29} cy={34} r={10} fill={c} /><circle cx={71} cy={34} r={10} fill={c} /><circle cx={29} cy={34} r={5} fill={l} /><circle cx={71} cy={34} r={5} fill={l} />
      <circle cx={50} cy={57} r={28} fill={c} /><ellipse cx={50} cy={68} rx={12} ry={9} fill={l} /><ellipse cx={50} cy={64} rx={4.5} ry={3} fill="#3f2a1d" />
      <Eyes /><Smile y={70} w={4} />
    </g>);
    case "fox": return (<g>
      <path d="M22 44 L26 12 L44 30 Z" fill={c} /><path d="M78 44 L74 12 L56 30 Z" fill={c} />
      <path d="M26 12 L30 22 L24 24 Z" fill={INK} /><path d="M74 12 L70 22 L76 24 Z" fill={INK} />
      <path d="M20 46 Q22 30 50 30 Q78 30 80 46 Q78 70 50 84 Q22 70 20 46 Z" fill={c} />
      <path d="M22 50 Q36 62 50 84 Q28 74 22 50 Z" fill="#fff" /><path d="M78 50 Q64 62 50 84 Q72 74 78 50 Z" fill="#fff" />
      <circle cx={50} cy={76} r={3.5} fill={INK} /><Eyes y={52} r={5} />
    </g>);
    case "bunny": return (<g>
      <ellipse cx={38} cy={22} rx={7} ry={20} fill={c} /><ellipse cx={62} cy={22} rx={7} ry={20} fill={c} />
      <ellipse cx={38} cy={24} rx={3.5} ry={14} fill="#fda4af" /><ellipse cx={62} cy={24} rx={3.5} ry={14} fill="#fda4af" />
      <circle cx={50} cy={60} r={26} fill={c} /><ellipse cx={50} cy={67} rx={9} ry={6} fill={l} />
      <ellipse cx={50} cy={64} rx={3} ry={2.2} fill="#f43f5e" /><rect x={47} y={68} width={6} height={5} rx={1.5} fill="#fff" stroke={d} strokeWidth={0.8} />
      <Eyes y={55} /><Cheeks y={65} />
    </g>);
    case "owl": return (<g>
      <path d="M24 38 L22 16 L40 30 Z" fill={d} /><path d="M76 38 L78 16 L60 30 Z" fill={d} />
      <ellipse cx={50} cy={58} rx={30} ry={29} fill={c} /><ellipse cx={50} cy={79} rx={16} ry={8} fill={l} />
      <circle cx={40} cy={53} r={11} fill={l} /><circle cx={60} cy={53} r={11} fill={l} />
      <Eyes y={53} r={7} /><path d="M46 62 L54 62 L50 69 Z" fill="#f59e0b" />
    </g>);
    case "panda": return (<g>
      <circle cx={29} cy={34} r={10} fill={d} /><circle cx={71} cy={34} r={10} fill={d} />
      <circle cx={50} cy={57} r={28} fill="#f8fafc" stroke={mix(c, 0.3)} strokeWidth={2} />
      <ellipse cx={39} cy={54} rx={8} ry={10} fill={d} transform="rotate(-20 39 54)" /><ellipse cx={61} cy={54} rx={8} ry={10} fill={d} transform="rotate(20 61 54)" />
      <Eyes r={4.5} /><ellipse cx={50} cy={65} rx={4} ry={2.8} fill={INK} /><Smile y={69} w={4} /><Cheeks y={66} />
    </g>);
    case "robot": return (<g>
      <path d="M50 14 V26" stroke={d} strokeWidth={3} /><circle cx={50} cy={12} r={4.5} fill="#f43f5e" />
      <rect x={15} y={46} width={8} height={16} rx={3} fill={d} /><rect x={77} y={46} width={8} height={16} rx={3} fill={d} />
      <rect x={21} y={26} width={58} height={54} rx={13} fill={c} />
      <rect x={29} y={40} width={42} height={25} rx={7} fill="#0f172a" />
      <circle cx={40} cy={52} r={5} fill="#67e8f9" /><circle cx={60} cy={52} r={5} fill="#67e8f9" /><circle cx={41.5} cy={50.5} r={1.5} fill="#fff" /><circle cx={61.5} cy={50.5} r={1.5} fill="#fff" />
      <rect x={37} y={69} width={26} height={6} rx={3} fill={d} /><g stroke={l} strokeWidth={1.2}><path d="M43 69 V75" /><path d="M50 69 V75" /><path d="M57 69 V75" /></g>
    </g>);
    case "boltbot": return (<g>
      <path d="M26 30 L20 18" stroke={d} strokeWidth={3} strokeLinecap="round" /><path d="M74 30 L80 18" stroke={d} strokeWidth={3} strokeLinecap="round" />
      <circle cx={20} cy={17} r={3.5} fill="#facc15" /><circle cx={80} cy={17} r={3.5} fill="#facc15" />
      <path d="M20 62 Q20 24 50 24 Q80 24 80 62 Z" fill={c} /><rect x={20} y={58} width={60} height={26} rx={8} fill={d} />
      <rect x={27} y={43} width={46} height={19} rx={9.5} fill="#1e293b" />
      <rect x={34} y={49} width={11} height={6} rx={3} fill="#a3e635" /><rect x={55} y={49} width={11} height={6} rx={3} fill="#a3e635" />
      <path d="M52 63 L44 73 L50 73 L46 82 L57 70 L51 70 L55 63 Z" fill="#facc15" />
    </g>);
    case "alien": return (<g>
      <path d="M41 32 L32 12" stroke={c} strokeWidth={3} strokeLinecap="round" /><path d="M59 32 L68 12" stroke={c} strokeWidth={3} strokeLinecap="round" />
      <circle cx={32} cy={11} r={4.5} fill={l} /><circle cx={68} cy={11} r={4.5} fill={l} />
      <ellipse cx={50} cy={56} rx={27} ry={30} fill={c} />
      <g fill={d} opacity={0.35}><circle cx={33} cy={40} r={3} /><circle cx={68} cy={70} r={2.5} /><circle cx={64} cy={36} r={2} /></g>
      <ellipse cx={40} cy={54} rx={7} ry={9} fill={INK} transform="rotate(-15 40 54)" /><ellipse cx={60} cy={54} rx={7} ry={9} fill={INK} transform="rotate(15 60 54)" />
      <circle cx={42} cy={50} r={2.2} fill="#fff" /><circle cx={62} cy={50} r={2.2} fill="#fff" />
      <ellipse cx={50} cy={70} rx={3.5} ry={2.5} fill={INK} />
    </g>);
    case "starblob": return (<g>
      <g fill="#fde047"><polygon points={star(18, 22, 5, 2, 4)} /><polygon points={star(84, 30, 4, 1.6, 4)} /><polygon points={star(80, 80, 3.5, 1.4, 4)} /></g>
      <path d="M50 22 C70 22 80 40 78 58 C77 70 72 78 66 82 Q62 76 58 82 Q54 76 50 83 Q46 76 42 82 Q38 76 34 82 C28 78 23 70 22 58 C20 40 30 22 50 22 Z" fill={c} />
      <ellipse cx={42} cy={34} rx={8} ry={4} fill="#fff" opacity={0.35} transform="rotate(-25 42 34)" />
      <Eyes /><Smile y={66} w={5} /><Cheeks />
    </g>);
    case "phoenix": return (<g>
      <path d="M38 34 Q34 14 44 6 Q44 20 50 24 Q52 8 62 4 Q58 20 62 30 Z" fill="#f97316" /><path d="M44 32 Q42 20 48 14 Q50 24 56 28 Z" fill="#facc15" />
      <path d="M22 62 Q8 56 10 40 Q20 52 28 52 Z" fill="#ef4444" /><path d="M78 62 Q92 56 90 40 Q80 52 72 52 Z" fill="#ef4444" />
      <circle cx={50} cy={58} r={27} fill={c} /><ellipse cx={50} cy={72} rx={13} ry={9} fill={l} />
      <Eyes /><path d="M45 62 L55 62 L50 70 Z" fill="#f59e0b" />
    </g>);
    case "dragon": return (<g>
      <path d="M32 36 L24 12 L42 30 Z" fill="#fde68a" /><path d="M68 36 L76 12 L58 30 Z" fill="#fde68a" />
      <path d="M41 32 L45 23 L49 31 Z M51 31 L55 22 L59 32 Z" fill={d} />
      <circle cx={50} cy={57} r={27} fill={c} /><ellipse cx={50} cy={71} rx={15} ry={10} fill={l} />
      <ellipse cx={45} cy={70} rx={1.8} ry={2.6} fill={INK} /><ellipse cx={55} cy={70} rx={1.8} ry={2.6} fill={INK} />
      <Eyes y={52} /><path d="M24 58 Q16 60 14 52" stroke={d} strokeWidth={3} fill="none" strokeLinecap="round" /><path d="M76 58 Q84 60 86 52" stroke={d} strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>);
    case "moon-whale": return (<g>
      <g stroke="#7dd3fc" strokeWidth={2.5} strokeLinecap="round"><path d="M50 30 V18" /><path d="M50 22 Q42 14 38 18" fill="none" /><path d="M50 22 Q58 14 62 18" fill="none" /></g>
      <polygon points={star(20, 22, 4, 1.6, 4)} fill="#fde047" /><polygon points={star(82, 24, 5, 2, 4)} fill="#fde047" />
      <path d="M12 62 Q12 34 50 34 Q88 34 88 62 Q88 84 50 84 Q12 84 12 62 Z" fill={c} />
      <path d="M20 70 Q50 88 80 70 Q72 82 50 82 Q28 82 20 70 Z" fill={l} />
      <path d="M58 40 A7 7 0 1 0 58 52 A5.5 5.5 0 1 1 58 40 Z" fill="#fef9c3" />
      <Eyes y={58} r={5.5} /><Smile y={70} w={6} /><Cheeks y={67} />
    </g>);
    default: return <circle cx={50} cy={56} r={28} fill={c} />;
  }
}

function Glasses({ code }: { code: string | null }) {
  switch (code) {
    case "round": return (<g stroke={INK} strokeWidth={2.4} fill="#fff" fillOpacity={0.18}><circle cx={40} cy={54} r={8.5} /><circle cx={60} cy={54} r={8.5} /><path d="M48.5 54 Q50 52 51.5 54" fill="none" /><path d="M31.5 53 L24 50" /><path d="M68.5 53 L76 50" /></g>);
    case "square": return (<g stroke="#7c3aed" strokeWidth={2.4} fill="#fff" fillOpacity={0.18}><rect x={30.5} y={47} width={18} height={14} rx={3} /><rect x={51.5} y={47} width={18} height={14} rx={3} /><path d="M48.5 53 H51.5" /><path d="M30.5 52 L24 49" /><path d="M69.5 52 L76 49" /></g>);
    case "shades": return (<g><path d="M29 49 H71 V52 Q70 62 61 62 Q53 62 52 53 H48 Q47 62 39 62 Q30 62 29 52 Z" fill="#0f172a" /><path d="M33 52 L38 52" stroke="#fff" strokeWidth={1.4} opacity={0.6} strokeLinecap="round" /><path d="M56 52 L61 52" stroke="#fff" strokeWidth={1.4} opacity={0.6} strokeLinecap="round" /></g>);
    case "star-glasses": return (<g stroke="#db2777" strokeWidth={2} fill="#f9a8d4" fillOpacity={0.45} strokeLinejoin="round"><polygon points={star(40, 54, 10, 5)} /><polygon points={star(60, 54, 10, 5)} /></g>);
    default: return null;
  }
}

function Hat({ code }: { code: string | null }) {
  switch (code) {
    case "cap": return (<g><path d="M27 35 Q29 15 50 15 Q71 15 73 35 Z" fill="#ef4444" /><path d="M58 33 Q80 29 88 36 Q78 39 58 37 Z" fill="#b91c1c" /><circle cx={50} cy={15.5} r={2.5} fill="#b91c1c" /></g>);
    case "beanie": return (<g><path d="M26 36 Q26 13 50 13 Q74 13 74 36 Z" fill="#6366f1" /><rect x={24} y={31} width={52} height={8} rx={4} fill="#818cf8" /><circle cx={50} cy={11} r={5.5} fill="#f9a8d4" /></g>);
    case "party": return (<g><path d="M38 33 L50 2 L62 33 Z" fill="#22c55e" /><path d="M42 23 L58 23 M45 14 L55 14" stroke="#fef08a" strokeWidth={3} /><circle cx={50} cy={3} r={3.5} fill="#facc15" /></g>);
    case "headphones": return (<g><path d="M20 54 Q20 17 50 17 Q80 17 80 54" stroke="#334155" strokeWidth={5} fill="none" /><rect x={13} y={45} width={13} height={21} rx={5} fill="#f43f5e" /><rect x={74} y={45} width={13} height={21} rx={5} fill="#f43f5e" /></g>);
    case "wizard": return (<g><path d="M31 33 L56 -1 L69 33 Z" fill="#4338ca" /><ellipse cx={50} cy={33} rx={27} ry={5} fill="#3730a3" /><polygon points={star(52, 16, 4.5, 1.8)} fill="#fde047" /><circle cx={44} cy={26} r={1.6} fill="#fde047" /></g>);
    case "crown": return (<g><path d="M29 33 L31 13 L41 23 L50 8 L59 23 L69 13 L71 33 Z" fill="#facc15" stroke="#ca8a04" strokeWidth={1.5} strokeLinejoin="round" /><circle cx={50} cy={25} r={3} fill="#ef4444" /><circle cx={38} cy={28} r={2} fill="#3b82f6" /><circle cx={62} cy={28} r={2} fill="#22c55e" /></g>);
    default: return null;
  }
}

/** The student's avatar (a circle). `avatar` may be a stored JSON value; unknown codes fall back safely. */
export function Avatar({ avatar, size = 40, title, ring = true }: { avatar: AvatarConfig | unknown; size?: number; title?: string; ring?: boolean }) {
  const a = toAvatar(avatar);
  const c = itemByCode(a.color)?.hex ?? "#38bdf8";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} data-avatar={a.base} className="shrink-0">
      {title && <title>{title}</title>}
      <circle cx={50} cy={50} r={50} fill={mix(c, 0.82)} />
      <g style={{ clipPath: "circle(50% at 50% 50%)" }}>
        <Base base={a.base} c={c} />
        <Glasses code={a.glasses} />
        <Hat code={a.hat} />
      </g>
      {ring && <circle cx={50} cy={50} r={48.5} fill="none" stroke={mix(c, -0.15)} strokeWidth={3} />}
    </svg>
  );
}

/** One accessory or character on its own (shop tiles). */
export function ItemPreview({ code, size = 56, current }: { code: string; size?: number; current: AvatarConfig }) {
  const i = itemByCode(code);
  if (!i) return null;
  const a: AvatarConfig = i.kind === "base" ? { ...current, base: code } : i.kind === "hat" ? { ...current, hat: code } : i.kind === "glasses" ? { ...current, glasses: code } : { ...current, color: code };
  return <Avatar avatar={a} size={size} />;
}

/** A badge as a small medal emblem (favorite badge next to a name, Live Board, class list, badges page). */
export function BadgeEmblem({ code, size = 22, label, locked = false }: { code: string | null | undefined; size?: number; label?: string; locked?: boolean }) {
  const b = badgeByCode(code);
  if (!b) return null;
  const tint = locked ? "#cbd5e1" : b.tint ?? "#f59e0b";
  return (
    <svg viewBox="0 0 40 46" width={size} height={size * 1.15} role="img" aria-label={label ?? b.name} data-badge={b.code} className={`inline-block shrink-0 align-middle ${locked ? "opacity-50 grayscale" : ""}`}>
      <title>{label ?? b.name}</title>
      <path d="M12 30 L8 45 L15 41 L19 46 L21 32 Z" fill={mix(tint, -0.2)} /><path d="M28 30 L32 45 L25 41 L21 46 L19 32 Z" fill={mix(tint, -0.35)} />
      <circle cx={20} cy={19} r={18} fill={tint} /><circle cx={20} cy={19} r={14} fill="#fff" />
      <text x={20} y={20} textAnchor="middle" dominantBaseline="central" fontSize={15}>{b.icon}</text>
    </svg>
  );
}

/** The coin (drawn, not an emoji: same on every device). */
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="inline-block shrink-0">
      <circle cx={12} cy={12} r={11} fill="#fbbf24" /><circle cx={12} cy={12} r={8} fill="#fcd34d" stroke="#d97706" strokeWidth={1.3} />
      <polygon points={star(12, 12, 5, 2.2)} fill="#d97706" />
    </svg>
  );
}
