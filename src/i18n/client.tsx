"use client";
import React, { useMemo } from "react";
import { dirOf, makeT, type Lang, type TFn } from "./index";

const LangContext = React.createContext("en" as Lang);

/** Set once in the root layout; every client component below reads the language from it. */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** The interface language ("en" default, "ar" for the parents' switch). */
export function useLang(): Lang {
  const v: unknown = React.useContext(LangContext);
  return v === "ar" ? "ar" : "en";
}
export const useDir = (): "ltr" | "rtl" => dirOf(useLang());
/** Client components: `const t = useT(); t("Home")`. Unknown text comes back unchanged. */
export function useT(): TFn {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
