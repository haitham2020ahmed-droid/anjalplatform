/** Checks ReadRise article files: levels, word counts, questions. Usage: npx tsx scripts/readrise/check.mts <file.json>… */
import { readFileSync } from "node:fs";
import { estimateLevel, RR_LEVELS, targetWords } from "../../src/server/readrise/level";

let bad = 0;
for (const f of process.argv.slice(2)) {
  const a = JSON.parse(readFileSync(f, "utf8"));
  const problems: string[] = [];
  const vs = (a.versions ?? []) as { level: number; title: string; text: string }[];
  if (vs.length !== 12) problems.push(`${vs.length} versions (need 12)`);
  let prev = -1;
  for (const lvl of RR_LEVELS) {
    const v = vs.find((x) => x.level === lvl);
    if (!v) { problems.push(`missing level ${lvl}`); continue; }
    const est = estimateLevel(v.text), words = (v.text.match(/[A-Za-z’'-]+/g) ?? []).length, tw = targetWords(lvl);
    const flag = Math.abs(est - lvl) > 100 ? " ✗ level" : "";
    const wflag = words < tw.min * 0.85 || words > tw.max * 1.2 ? ` ✗ words (${tw.min}-${tw.max})` : "";
    if (est <= prev - 30) problems.push(`level ${lvl} reads easier than the level below (${est} ≤ ${prev})`);
    prev = est;
    if (flag || wflag) problems.push(`level ${lvl}: est ${est}, ${words} words${flag}${wflag}`);
    console.log(`${a.code} ${String(lvl).padStart(4)} est ${String(est).padStart(4)} words ${String(words).padStart(3)}${flag}${wflag}`);
  }
  for (const b of ["LOW", "MID", "HIGH"]) {
    const band = a.bands?.[b];
    if (!band) { problems.push(`missing band ${b}`); continue; }
    const qs = band.questions ?? [];
    if (qs.length !== 8) problems.push(`${b}: ${qs.length} questions (need 8)`);
    const answers = qs.map((q: { answer: string }) => q.answer);
    for (const [i, q] of qs.entries()) {
      if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`${b} q${i + 1}: needs 4 options`);
      if (!/^[ABCD]$/.test(q.answer)) problems.push(`${b} q${i + 1}: answer must be A–D`);
      if (!q.skill || !q.why) problems.push(`${b} q${i + 1}: skill and why are required`);
      const lens = (q.options ?? []).map((o: string) => o.length), right = lens["ABCD".indexOf(q.answer)];
      if (right === Math.max(...lens) && lens.filter((l: number) => l === right).length === 1 && right > 1.4 * Math.min(...lens)) q._longest = true;
    }
    const longest = qs.filter((q: { _longest?: boolean }) => q._longest).length;
    if (longest > 4) problems.push(`${b}: the right answer is clearly the longest in ${longest}/8 questions`);
    if (new Set(answers).size < 3) problems.push(`${b}: answers use fewer than 3 different letters`);
    if (!band.prompt) problems.push(`${b}: prompt missing`);
    const kws = (band.keyWords ?? []) as { word: string; definition: string; example: string }[];
    if (kws.length !== 5) problems.push(`${b}: ${kws.length} key words (need 5)`);
    const lo = b === "LOW" ? 300 : b === "MID" ? 700 : 1100;
    for (const k of kws) {
      if (!k.word || !k.definition || !k.example) problems.push(`${b}: key word needs word, definition, example`);
      for (const lvl of [lo, lo + 100, lo + 200, lo + 300]) {
        const v = vs.find((x) => x.level === lvl);
        if (v && k.word && !new RegExp(`\\b${k.word.toLowerCase().slice(0, Math.max(4, k.word.length - 2))}`, "i").test(v.text)) problems.push(`${b}: key word "${k.word}" not found in version ${lvl}`);
      }
    }
  }
  if (!a.poll) problems.push("poll missing");
  if (problems.length) { bad++; console.log(`✗ ${f}\n  - ${problems.join("\n  - ")}`); } else console.log(`✓ ${f}`);
}
process.exit(bad ? 1 : 0);
