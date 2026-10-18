/** Bilingual UI strings for the School Reports pages. `?lang=ar` switches the page; English is the default. */
import { ar } from "./ar";
import { en, type I18nKey } from "./en";

export type Locale = "en" | "ar";
export function t(locale: Locale, key: I18nKey): string {
  return (locale === "ar" ? ar : en)[key];
}
export function localeFrom(v: string | undefined): Locale {
  return v === "ar" ? "ar" : "en";
}
/** The two languages' own native names (not translated by locale — "العربية" stays "العربية" either way). */
export const LANG_NAMES: Record<Locale, string> = { en: "English", ar: "العربية" };
