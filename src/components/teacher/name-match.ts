/**
 * Name matching for "My Students" (on the device, as you type) and the server search: Arabic and English names,
 * student ID and username. Pure functions, no imports, so the browser and the server share them.
 */
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Lower case; Arabic diacritics (harakat, tanween, shadda, sukun, dagger alif, Quranic marks) and tatweel removed;
 * hamza / madda alif forms → bare alif, taa marbuta → haa, alif maqsura → yaa; spaces collapsed.
 */
export function normalizeName(v: unknown): string {
  return str(v).normalize("NFC").toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "") // diacritics, Quranic marks, tatweel
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627") // alif forms → alif
    .replace(/\u0629/g, "\u0647") // taa marbuta → haa
    .replace(/\u0649/g, "\u064A") // alif maqsura → yaa
    .replace(/\s+/g, " ").trim();
}

/** Does the student match every word typed (name, student ID or username)? Empty text matches everyone. */
export function matchesStudent(x: { name: string; number: string; username: string }, q: string): boolean {
  const words = normalizeName(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeName(`${x.name} ${x.number} ${x.username}`);
  return words.every((w) => hay.includes(w));
}
