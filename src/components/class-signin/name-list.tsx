/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";

/** A search box shows from this many names (a long class list). */
export const SEARCH_FROM = 12;

/**
 * 👆 The class's names as big buttons (phones and tablets). Each is a plain form post (works across deployments, no
 * script needed) straight to `signInPath` — tap a name and you're in, no extra step; the search box only filters
 * what is shown.
 * 🔁 fix (Oct 2026, "الكود مالوش داعي... اي حد ممكن يستخدمه"): the printed QR used to send a tapped name to a
 * second page asking for the class code first — but that code is printed on the very same sheet as the QR, so it
 * added a step without adding real protection. Both the board QR and the printed QR now sign in the same way:
 * tap your name → you're in.
 */
export function NameList({ names, signInKey, signInPath = "/qr/signin" }: { names: { id: string; name: string }[]; signInKey: string; signInPath?: string }) {
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
            <form method="post" action={signInPath} onSubmit={() => setSent(n.id)}>
              <input type="hidden" name="key" value={signInKey} />
              <input type="hidden" name="studentId" value={n.id} />
              <button disabled={sent !== null} className="min-h-16 w-full rounded-2xl bg-brand-navy px-4 text-xl font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-60">
                <bdi>{n.name}</bdi>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="text-muted">{t("No name matches. Ask your teacher.")}</p>}
    </div>
  );
}
