import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { LANG_COOKIE, isLang } from "@/i18n";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, isProd, repo } from "@/server/auth/next";
import { saveUiLang } from "@/server/ui/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ui-lang {lang: "en" | "ar"} — the "English | Arabic" switch. Changes the INTERFACE language only.
 * Always remembered on this device (cookie, so the sign-in page follows too); when signed in, also saved on the
 * user so every device opens in the same language.
 */
export async function POST(req: Request) {
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const lang = (body as { lang?: unknown } | null)?.lang;
  if (!isLang(lang)) return NextResponse.json({ error: "Unknown language." }, { status: 400 });
  const actor = await apiActor().catch(() => null);   // optional: the sign-in page can switch too
  if (actor) await saveUiLang(repo, actor, lang);
  const res = NextResponse.json({ ok: true, lang }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", httpOnly: false, secure: isProd, maxAge: 60 * 60 * 24 * 365 });
  return res;
}
