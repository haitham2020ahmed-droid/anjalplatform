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

/** the fixed level / domain / proficiency words the diagnostic services return in English (skill and goal-area names stay as they are) */
const AR_WORDS: Record<string, string> = {
  "Below grade level": "دون مستوى الصف", "Approaching grade level": "يقترب من مستوى الصف", "At grade level": "في مستوى الصف", "Above grade level": "فوق مستوى الصف",
  Strength: "نقطة قوة", Developing: "قيد التطور", "Needs support": "يحتاج إلى دعم",
  Reading: "القراءة", Vocabulary: "المفردات", Grammar: "القواعد", "Punctuation & capitals": "الترقيم والحروف الكبيرة", "Spelling & word study": "الإملاء ودراسة الكلمات", Writing: "الكتابة",
  Literature: "الأدب", "Informational Text": "النص المعلوماتي", Language: "اللغة", "Foundational Skills": "المهارات الأساسية",
  "Exceeding the standard": "يتجاوز المعيار", "Meeting the standard": "يحقّق المعيار", "Approaching the standard": "يقترب من المعيار", "Level not set": "المستوى غير محدد",
  Advanced: "متقدّم", Proficient: "متمكّن", Approaching: "يقترب", Intensive: "دعم مكثّف", "Intensive Support": "دعم مكثّف",
};
/**
 * One service word / sentence in the reader's language: the fixed words above, “Strength (78%)” level cells, and the
 * Diagnostic Test's proficiency sentence (“Meeting the standard · 72% correct on the Diagnostic Test” /
 * “… · Diagnostic score 72.5 (0–100)”).
 */
export function word(locale: Locale, w: string): string {
  if (locale !== "ar") return w;
  if (AR_WORDS[w]) return AR_WORDS[w];
  if (w.includes(" · ")) return w.split(" · ").map((p) => word(locale, p)).join(" · ");
  let m = w.match(/^([\d.]+)% correct on the Diagnostic Test$/);
  if (m) return `${m[1]}% إجابات صحيحة في الاختبار التشخيصي`;
  m = w.match(/^Diagnostic score ([\d.]+) \(0–100\)$/);
  if (m) return `درجة الاختبار التشخيصي ${m[1]} (من 0 إلى 100)`;
  return w.replace(/^(Strength|Developing|Needs support)(?= \()/, (x) => AR_WORDS[x]);
}
