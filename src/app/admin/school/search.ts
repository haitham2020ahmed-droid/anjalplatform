/**
 * The School page's search box (pure, used in the browser and in tests): Arabic and English names, usernames and
 * numbers. Case, Latin accents, Arabic diacritics and tatweel are ignored; alef forms, alef maqsura / yeh and
 * teh marbuta / heh are treated as the same letter.
 */
export function normSearch(v: string): string {
  return v.normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u0655\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Does the search text match any of the values? Empty search matches everything. */
export function matchesSearch(q: string, ...values: string[]): boolean {
  const n = normSearch(q);
  return !n || values.some((v) => normSearch(v).includes(n));
}
