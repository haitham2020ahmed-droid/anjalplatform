import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getActor } from "@/server/auth/next";
import { dirOf, LANG_COOKIE, makeT, toLang, type Lang, type TFn } from "./index";

/**
 * The interface language for this request: the signed-in user's saved choice, else this device's cookie,
 * else English. Memoised per request (getActor is already cached, so no extra query).
 */
export const getLang = cache(async (): Promise<Lang> => {
  try {
    const me = await getActor();
    const saved = me?.user.uiLang;
    if (saved === "en" || saved === "ar") return saved;
  } catch { /* signed out or database not reachable: fall back to the cookie */ }
  try { return toLang((await cookies()).get(LANG_COOKIE)?.value); } catch { return "en"; }
});

/** Server components: `const { t, lang, dir } = await getT();` */
export async function getT(): Promise<{ lang: Lang; dir: "ltr" | "rtl"; t: TFn }> {
  const lang = await getLang();
  return { lang, dir: dirOf(lang), t: makeT(lang) };
}
