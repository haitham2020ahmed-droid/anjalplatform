/**
 * Students never see the name of their level (Below / On / Above). Work titles made for teachers keep the
 * level (“… (Below Level)”); everything a student reads goes through hideLevels first.
 */
const PATTERNS: RegExp[] = [
  /\s*\(adaptive(?::[^)]*)?\)/gi,
  /\s*\((?:Below|On|Above) Level\)/gi,
  /\s*[·•|-]\s*(?:Below|On|Above) Level\b/gi,
  /\b(?:Below|On|Above) Level\s*[·•|:-]\s*/gi,
];

export function hideLevels(text: string | null | undefined): string {
  let t = String(text ?? "");
  for (const p of PATTERNS) t = t.replace(p, "");
  return t.replace(/\s{2,}/g, " ").trim();
}
