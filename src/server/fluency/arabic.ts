/**
 * 🌙 Support for Arabic-speaking readers of English (original guidance, written for this platform).
 * English has sounds and spellings that Arabic does not have, so some reading mistakes are very common and easy to
 * fix with the right tip. The coach tags a missed word with these codes and shows a friendly tip.
 *
 * An accent is NEVER a mistake: only a wrong, changed or skipped word counts (the scorer is told this too). The tags
 * are for tips only and never change a score.
 */
export type ArabicCode = "PB" | "VF" | "SHORT_VOWEL" | "CLUSTER" | "SILENT" | "ED" | "TH";

export interface ArabicTip { code: ArabicCode; title: string; why: string; tip: string; practice: string[] }

export const ARABIC_TIPS: Record<ArabicCode, ArabicTip> = {
  PB: {
    code: "PB", title: "p and b",
    why: "Arabic has a b sound but no p sound, so p can come out as b (park → bark).",
    tip: "Hold a paper in front of your mouth. Say “p” — the paper moves (a puff of air, no voice). Say “b” — it stays still and your throat buzzes.",
    practice: ["pen / ben", "pat / bat", "pig / big", "cap / cab"],
  },
  VF: {
    code: "VF", title: "v and f",
    why: "Arabic has an f sound but no v sound, so v can come out as f (very → fery).",
    tip: "Top teeth gently on your bottom lip. For f, just blow. For v, add your voice — your lip should tickle.",
    practice: ["fan / van", "fine / vine", "safe / save", "leaf / leave"],
  },
  SHORT_VOWEL: {
    code: "SHORT_VOWEL", title: "short vowels",
    why: "Arabic writing often leaves short vowels out, so English short vowels are easy to mix up (bit / bet / bat).",
    tip: "Look at the vowel letter in the middle and say its short sound: a (apple), e (egg), i (itch), o (octopus), u (up).",
    practice: ["bat / bet / bit", "pan / pen / pin", "cap / cop / cup", "sat / set / sit"],
  },
  CLUSTER: {
    code: "CLUSTER", title: "consonant groups",
    why: "Arabic words do not start with two consonants together, so readers may add a vowel (street → istreet or sitreet).",
    tip: "Glide straight from one consonant to the next, with no little vowel in between: s-t-r → “str”.",
    practice: ["street", "spring", "school", "plant", "friends"],
  },
  SILENT: {
    code: "SILENT", title: "silent letters",
    why: "In Arabic you say the letters you see. English has some quiet letters (knee, write, climb, night).",
    tip: "Learn the quiet-letter families: kn (k is quiet), wr (w is quiet), mb (b is quiet), igh (gh is quiet).",
    practice: ["knee", "write", "climb", "night", "listen"],
  },
  ED: {
    code: "ED", title: "-ed endings",
    why: "-ed looks like one sound but has three: t (jumped), d (played) and id (wanted). Readers often say “jump-ed”.",
    tip: "Only add an extra “id” syllable when the word ends in t or d: want-ed, need-ed. Otherwise, it is one beat: jumped = “jumpt”.",
    practice: ["jumped", "played", "wanted", "helped", "needed"],
  },
  TH: {
    code: "TH", title: "th sounds",
    why: "Many Arabic speakers say th as s, t, z or d in English words (think → sink, this → zis).",
    tip: "Put the tip of your tongue between your teeth and blow: think. Add your voice for this, that, mother.",
    practice: ["think / sink", "three / tree", "they / day", "thick / tick"],
  },
};

const letters = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");
const skeleton = (w: string) => w.replace(/[aeiou]+/g, "_");

/** Tags for one missed word (what the reader said is optional). Tips only — never used to score. */
export function arabicTags(word: string, heard = ""): ArabicCode[] {
  const w = letters(word), h = letters(heard);
  if (w.length < 2) return [];
  const out: ArabicCode[] = [];
  // p said as b (or b as p)
  if (h && ((w.includes("p") && !w.includes("b") && h.includes("b")) || (w.includes("b") && !w.includes("p") && h.includes("p")))) out.push("PB");
  // v said as f (or f as v)
  if (h && ((w.includes("v") && !w.includes("f") && h.includes("f")) || (w.includes("f") && !w.includes("v") && h.includes("v")))) out.push("VF");
  // th said as s / t / z / d
  if (h && w.includes("th") && !h.includes("th")) out.push("TH");
  // -ed endings
  if (h && /[a-z]{2,}ed$/.test(w) && h !== w) out.push("ED");
  // silent letters
  if (/^kn|^wr|mb$|igh|ough|augh|^gn|stle$|sten$/.test(w)) out.push("SILENT");
  // a vowel added before or inside a starting consonant group
  const cl = w.match(/^(str|spr|spl|scr|squ|thr|shr|[bcdfgkpst][lr]|s[ckmnptw])/);
  if (cl && h && (/^[aeiu]/.test(h) || (h.length > w.length && /[aeiu]/.test(h[1] ?? "") && !/[aeiu]/.test(w[1])))) out.push("CLUSTER");
  // only the vowels changed (bit → bet)
  if (h && h !== w && h.length === w.length && skeleton(h) === skeleton(w)) out.push("SHORT_VOWEL");
  return [...new Set(out)];
}

/** The tips to show for a set of missed words (most frequent first, at most `max`). */
export function tipsFor(errors: { word: string; heard?: string; arabic?: string[] }[], max = 3): (ArabicTip & { words: string[] })[] {
  const by = new Map<ArabicCode, Set<string>>();
  for (const e of errors) {
    const codes = (e.arabic?.length ? e.arabic : arabicTags(e.word, e.heard ?? "")) as ArabicCode[];
    for (const c of codes) { if (!ARABIC_TIPS[c]) continue; if (!by.has(c)) by.set(c, new Set()); by.get(c)!.add(e.word); }
  }
  return [...by].sort((a, b) => b[1].size - a[1].size).slice(0, max).map(([c, ws]) => ({ ...ARABIC_TIPS[c], words: [...ws].slice(0, 6) }));
}
