/**
 * English + Arabic wording for admin confirmation dialogs (bulk-delete and other destructive
 * actions), with a tiny lookup + {placeholder} substitution helper.
 *
 * This is a SEPARATE small dictionary from the platform's main src/i18n/en.ts / ar.ts (those are
 * the full UI_STRINGS dictionaries used across the whole app). The admin area itself has no
 * language switch today, so these strings exist so that every destructive admin action already
 * has an Arabic counterpart ready for when the admin UI grows one, and so the wording for "what
 * will be deleted" / "this cannot be undone" is written once and reused, instead of copy-pasted
 * per button. {placeholders} are filled by `t()`.
 */
export const en = {
  "bulkDelete.flags.confirm":
    "Permanently delete {count} flagged question(s)? This cannot be undone. Questions students have already answered are kept — archive those instead.",
  "bulkDelete.flags.none": "Select at least one flagged question first.",
  "bulkDelete.roster.warning":
    "This permanently deletes ALL students in this school and every piece of their data — answers, practice sessions, MAP scores, levels, ReadMaster progress, badges and game history. This cannot be undone. Download the backup first.",
  "bulkDelete.roster.typeToConfirmLabel": "Type",
  "bulkDelete.roster.typeToConfirmSuffix": "to confirm",
  "bulkDelete.genericCannotUndo": "This cannot be undone.",
} as const;

export const ar: Record<keyof typeof en, string> = {
  "bulkDelete.flags.confirm":
    "هل تريد حذف {count} سؤال (أسئلة) مُعلَّمة نهائيًا؟ لا يمكن التراجع عن هذا الإجراء. الأسئلة التي سبق للطلاب الإجابة عنها تُحفظ — استخدم الأرشفة لها بدلاً من الحذف.",
  "bulkDelete.flags.none": "اختر سؤالًا واحدًا على الأقل من الأسئلة المُعلَّمة.",
  "bulkDelete.roster.warning":
    "سيؤدي هذا إلى حذف جميع طلاب هذه المدرسة نهائيًا وكل بياناتهم — الإجابات وجلسات التدريب ونتائج MAP والمستويات وتقدّم ReadMaster والشارات وسجل الألعاب. لا يمكن التراجع عن هذا الإجراء. نزّل النسخة الاحتياطية أولاً.",
  "bulkDelete.roster.typeToConfirmLabel": "اكتب",
  "bulkDelete.roster.typeToConfirmSuffix": "للتأكيد",
  "bulkDelete.genericCannotUndo": "لا يمكن التراجع عن هذا الإجراء.",
};

export type Locale = "en" | "ar";
export type Key = keyof typeof en;
const DICT: Record<Locale, Record<Key, string>> = { en, ar };

export function t(locale: Locale, key: Key, vars: Record<string, string | number> = {}): string {
  return DICT[locale][key].replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Every English key must have a non-empty Arabic translation (checked by tests/admin-confirm-i18n.test.ts). */
export function missingTranslations(): Key[] {
  return (Object.keys(en) as Key[]).filter((k) => !ar[k] || !ar[k].trim());
}
