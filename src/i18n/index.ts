/**
 * Interface language (menus, headings, buttons, labels ONLY). English is the default; Arabic is the optional
 * parents' switch and turns the page right-to-left. Lessons, passages, questions, answer choices, feedback and
 * report content are never passed through t(): they always stay English.
 */
import { ar } from "./ar";
import { UI_STRINGS, type UiString } from "./en";

export type Lang = "en" | "ar";
export const LANGS: readonly Lang[] = ["en", "ar"];
export const DEFAULT_LANG: Lang = "en";
/** Cookie that remembers the choice on this device (the user's own setting wins when signed in). */
export const LANG_COOKIE = "ui-lang";

/** Each language written in itself (the switch always shows both). */
export const LANG_NAMES: Record<Lang, string> = { en: "English", ar: "العربية" };

export const isLang = (v: unknown): v is Lang => v === "en" || v === "ar";
export const toLang = (v: unknown): Lang => (isLang(v) ? v : DEFAULT_LANG);
export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr");

const KNOWN = new Set<string>(UI_STRINGS);
/** True when the English text is an interface string listed in en.ts. */
export const isUiString = (s: string): s is UiString => KNOWN.has(s);

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Translate one interface string. Unknown text (names, product content, anything not in en.ts) comes back
 * unchanged, so passing content by mistake can never turn it into Arabic.
 */
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  if (lang === "ar" && isUiString(text)) return fill(ar[text], vars);
  return fill(text, vars);
}

export type TFn = (text: string, vars?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): TFn => (text, vars) => translate(lang, text, vars);

export { UI_STRINGS, type UiString };
