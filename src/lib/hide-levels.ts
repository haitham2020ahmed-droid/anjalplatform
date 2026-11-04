/**
 * Students never see the name of their level (Approaching / Meeting / Exceeding, formerly Below / On / Above).
 * Work titles made for teachers keep the level (“… (Approaching)”, older ones “… (Below Level)”); everything a
 * student reads goes through hideLevels first.
 */
const WORD = "(?:(?:Below|On|Above) Level|(?:Approaching|Meeting|Exceeding)(?: the standard)?)";
const PATTERNS: RegExp[] = [
  /\s*\(adaptive(?::[^)]*)?\)/gi,
  // students never see how many questions a Review/quiz holds, even when a caller forgot exactTitle
  /\s*\(\d+\s+questions?\)\s*$/gi,
  new RegExp(`\\s*\\(${WORD}\\)`, "gi"),
  /\s*[·•|-]\s*(?:Below|On|Above) Level\b/gi,
  /\b(?:Below|On|Above) Level\s*[·•|:-]\s*/gi,
  /\s*[·•|]\s*(?:Approaching|Meeting|Exceeding)(?: the standard)?(?![\w-])/g,
  /\b(?:Approaching|Meeting|Exceeding)(?: the standard)?\s*[·•|]\s*/g,
];

export function hideLevels(text: string | null | undefined): string {
  let t = String(text ?? "");
  for (const p of PATTERNS) t = t.replace(p, "");
  return t.replace(/\s{2,}/g, " ").trim();
}
