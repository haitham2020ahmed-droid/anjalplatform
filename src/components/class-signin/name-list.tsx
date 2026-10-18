/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";

/** A search box shows from this many names (a long class list). */
export const SEARCH_FROM = 12;

/**
 * 👆 The class's names as big buttons (phones and tablets). Each is a plain form post to /qr/signin (works across
 * deployments, no script needed); the search box only filters what is shown.
 */
export function NameList({ names, signInKey, pickHref }: { names: { id: string; name: string }[]; signInKey: string; /** r85 printed QR: a name opens this page (+ ?s=<id>) to type the class code */ pickHref?: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const find = q.trim().toLocaleLowerCase();
  const shown = find ? names.filter((n) => n.name.toLocaleLowerCase().includes(find)) : names;
  return (
    <div>
      {names.length >= SEARCH_FROM && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find your name")} aria-label={t("Find your name")}
          className="mb-4 min-h-12 w-full rounded-2xl border-2 border-slate-300 px-4 text-lg focus:border-brand-teal focus:outline-none" />
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((n) => (
          <li key={n.id}>
            {pickHref ? (
              <a href={`${pickHref}?s=${encodeURIComponent(n.id)}`} className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-brand-navy px-4 text-xl font-bold text-white shadow-sm hover:opacity-90">
                <bdi>{n.name}</bdi>
              </a>
            ) : (
            <form method="post" action="/qr/signin" onSubmit={() => setSent(n.id)}>
              <input type="hidden" name="key" value={signInKey} />
              <input type="hidden" name="studentId" value={n.id} />
              <button disabled={sent !== null} className="min-h-16 w-full rounded-2xl bg-brand-navy px-4 text-xl font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-60">
                <bdi>{n.name}</bdi>
              </button>
            </form>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-muted">{t("No name matches. Ask your teacher.")}</p>}
    </div>
  );
}
