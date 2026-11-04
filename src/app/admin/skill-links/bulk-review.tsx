"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import type { GroupPage, ReviewGroup } from "@/server/questions/link-review-bulk";
import { acceptAllGuessesAction, acceptConfidentAction, acceptGroupAction, aiProgressAction, confidentCountAction, groupRowsAction, guessedCountAction, improveGuessesAction, leaveRowAction, moveRowAction } from "./actions";
import { Combo } from "@/components/ui/combo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const Bar = ({ pct }: { pct: number }) => (
  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
);
const STATUS = "mt-3 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200";
const ALERT = "mt-3 rounded-xl bg-red-50 px-4 py-2 text-red-800 ring-1 ring-red-200";

/** ✨ “Improve guesses with AI”: one request of ~15 questions at a time; waits for the school's AI limits; stop / resume. */
export function ImproveWithAi() {
  const t = useT();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState<{ total: number; improved: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run() {
    setError(null); setNote(null); stop.current = false; setRunning(true);
    const p0 = await aiProgressAction();
    if (!p0.result) { setError(p0.error ?? t("Something went wrong. Try again.")); setRunning(false); return; }
    let p = p0.result; setProg(p);
    let after: string | null = null;
    for (let guard = 0; guard < 2000 && !stop.current; guard++) {
      const r = await improveGuessesAction(after);
      if (!r.result) { setError(r.error ?? t("Something went wrong. Try again.")); break; }
      const b = r.result;
      if (b.stop) { setError(b.message ?? t("Something went wrong. Try again.")); break; }
      if (b.waitMs > 0) {
        setNote(t("Waiting for the AI limit: {n} s…", { n: Math.ceil(b.waitMs / 1000) }));
        for (let w = 0; w < b.waitMs && !stop.current; w += 1000) await sleep(1000);
        setNote(null);
        continue;
      }
      p = { ...p, improved: Math.min(p.total, p.improved + b.improved) }; setProg(p);
      if (b.message) setNote(b.message);
      if (b.done || !b.next) { setNote(t("Every question has an AI guess.")); break; }
      after = b.next;
    }
    setRunning(false);
    router.refresh();
  }

  const pct = prog?.total ? (prog.improved / prog.total) * 100 : 0;
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="font-semibold text-brand-navy">{t("Improve guesses with AI")}</h3>
      <p className="text-sm text-slate-600">{t("The AI reads each question and its choices and picks the best skill of its grade. Only the question text, the choices and the skill names are sent. Nothing is linked until you accept.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!running ? <button type="button" onClick={run} className={BTN_PRIMARY}>{prog ? t("Continue") : t("Improve guesses with AI")}</button>
          : <button type="button" onClick={() => { stop.current = true; }} className={BTN_SECONDARY}>{t("Stop")}</button>}
      </div>
      {prog && (
        <div className="mt-3" role="status">
          <p className="text-sm text-slate-700">{t("{n} of {m} improved", { n: prog.improved, m: prog.total })}</p>
          <Bar pct={pct} />
        </div>
      )}
      {note && <p role="status" className="mt-2 text-sm text-slate-600">{t(note)}</p>}
      {error && <p role="alert" className={ALERT}>{t(error)}</p>}
    </div>
  );
}

/** ✓ “Accept all confident guesses” (sure ≥ 80%): preview count first, then batches with a progress bar. */
export function AcceptConfident() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "preview" | "running" | "done">("idle");
  const [count, setCount] = useState(0);
  const [done, setDone] = useState({ linked: 0, failed: 0 });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function preview() {
    setError(null);
    const r = await confidentCountAction();
    if (r.result === undefined) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setCount(r.result); setPhase("preview");
  }
  async function run() {
    setError(null); stop.current = false; setPhase("running");
    let after: string | null = null, sum = { linked: 0, failed: 0 };
    setDone(sum);
    for (let guard = 0; guard < 2000 && !stop.current; guard++) {
      const r = await acceptConfidentAction(after);
      if (!r.result) { setError(r.error ?? t("Something went wrong. Try again.")); break; }
      // 🛑 fix (Oct 2026): the server pauses a batch (same cursor, nothing done) when it is low on memory, instead
      // of doing more work on top of an already-busy instance — wait it out here, same as the AI tool above.
      if (r.result.waitMs > 0) { setNote(t("Waiting a moment for the server…")); await sleep(r.result.waitMs); setNote(null); continue; }
      sum = { linked: sum.linked + r.result.linked, failed: sum.failed + r.result.failed }; setDone(sum);
      if (r.result.done || !r.result.next) break;
      after = r.result.next;
    }
    setPhase("done");
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="font-semibold text-brand-navy">{t("Accept all confident guesses")}</h3>
      <p className="text-sm text-slate-600">{t("Links every question whose best guess is at least 80% sure. Past answers move with the question.")}</p>
      {phase === "idle" && <button type="button" onClick={preview} className={`${BTN_PRIMARY} mt-3`}>{t("Accept all confident guesses")}</button>}
      {phase === "preview" && (
        <div className="mt-3">
          <p role="status" className="font-semibold text-slate-800">{t("{n} questions will be linked", { n: count })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={run} disabled={!count} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Run")}</button>
            <button type="button" onClick={() => setPhase("idle")} className={BTN_SECONDARY}>{t("Cancel")}</button>
          </div>
        </div>
      )}
      {phase === "running" && (
        <div className="mt-3" role="status">
          <p className="text-sm text-slate-700">{t("{n} of {m}", { n: done.linked + done.failed, m: count })}</p>
          <Bar pct={count ? ((done.linked + done.failed) / count) * 100 : 0} />
          <button type="button" onClick={() => { stop.current = true; }} className={`${BTN_SECONDARY} mt-2`}>{t("Stop")}</button>
        </div>
      )}
      {note && <p role="status" className="mt-2 text-sm text-slate-600">{t(note)}</p>}
      {phase === "done" && <p role="status" className={STATUS}>✓ {t("{n} question(s) linked to their skill.", { n: done.linked })}{done.failed ? ` ${t("{n} could not be linked and stay in the list.", { n: done.failed })}` : ""}</p>}
      {error && <p role="alert" className={ALERT}>{t(error)}</p>}
    </div>
  );
}

/** ✓✓ “Accept all guesses” — the owner's one-click request: every open row's best guess, no 80% floor (so a
 *  60%-sure row is included too, unlike AcceptConfident). Same accept path (approveReview), just no threshold —
 *  asks to confirm first since lower-confidence guesses are more likely to need a real review. */
export function AcceptAllGuesses() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "preview" | "running" | "done">("idle");
  const [count, setCount] = useState(0);
  const [done, setDone] = useState({ linked: 0, failed: 0 });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function preview() {
    setError(null);
    const r = await guessedCountAction();
    if (r.result === undefined) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setCount(r.result); setPhase("preview");
  }
  async function run() {
    setError(null); stop.current = false; setPhase("running");
    let after: string | null = null, sum = { linked: 0, failed: 0 };
    setDone(sum);
    for (let guard = 0; guard < 2000 && !stop.current; guard++) {
      const r = await acceptAllGuessesAction(after);
      if (!r.result) { setError(r.error ?? t("Something went wrong. Try again.")); break; }
      // 🛑 fix (Oct 2026): same server-side memory pause as AcceptConfident above.
      if (r.result.waitMs > 0) { setNote(t("Waiting a moment for the server…")); await sleep(r.result.waitMs); setNote(null); continue; }
      sum = { linked: sum.linked + r.result.linked, failed: sum.failed + r.result.failed }; setDone(sum);
      if (r.result.done || !r.result.next) break;
      after = r.result.next;
    }
    setPhase("done");
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <h3 className="font-semibold text-brand-navy">{t("Accept every guess")}</h3>
      <p className="text-sm text-slate-600">{t("Links every open question to its best guess, whatever its confidence — not just the sure (80%+) ones. Faster, but some guesses may be wrong: worth a spot check after.")}</p>
      {phase === "idle" && <button type="button" onClick={preview} className={`${BTN_PRIMARY} mt-3`}>{t("Accept every guess")}</button>}
      {phase === "preview" && (
        <div className="mt-3">
          <p role="status" className="font-semibold text-slate-800">{t("{n} questions will be linked", { n: count })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={run} disabled={!count} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Run")}</button>
            <button type="button" onClick={() => setPhase("idle")} className={BTN_SECONDARY}>{t("Cancel")}</button>
          </div>
        </div>
      )}
      {phase === "running" && (
        <div className="mt-3" role="status">
          <p className="text-sm text-slate-700">{t("{n} of {m}", { n: done.linked + done.failed, m: count })}</p>
          <Bar pct={count ? ((done.linked + done.failed) / count) * 100 : 0} />
          <button type="button" onClick={() => { stop.current = true; }} className={`${BTN_SECONDARY} mt-2`}>{t("Stop")}</button>
        </div>
      )}
      {note && <p role="status" className="mt-2 text-sm text-slate-600">{t(note)}</p>}
      {phase === "done" && <p role="status" className={STATUS}>✓ {t("{n} question(s) linked to their skill.", { n: done.linked })}{done.failed ? ` ${t("{n} could not be linked and stay in the list.", { n: done.failed })}` : ""}</p>}
      {error && <p role="alert" className={ALERT}>{t(error)}</p>}
    </div>
  );
}

/** 🗂 “By suggested skill”: the groups (counts) first; a group's questions load when it is opened (100 a page). */
export function GroupView({ groups }: { groups: ReviewGroup[] }) {
  if (!groups.length) return null;
  return (
    <ul className="space-y-3">
      {groups.map((g) => <Group key={g.label || "-"} g={g} />)}
    </ul>
  );
}

function Group({ g }: { g: ReviewGroup }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GroupPage | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(page: number) {
    setBusy(true); setError(null);
    const r = await groupRowsAction(g.label, page);
    setBusy(false);
    if (!r.result) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setData(r.result); setGone(new Set());
    setTicked(new Set(r.result.rows.filter((x) => x.guessId).map((x) => x.id)));
  }
  function toggle() {
    const next = !open; setOpen(next);
    if (next && !data) void load(1);
  }
  async function acceptTicked() {
    if (!data) return;
    const ids = data.rows.filter((r) => ticked.has(r.id) && !gone.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    setBusy(true); setError(null);
    const r = await acceptGroupAction(ids);
    setBusy(false);
    if (!r.result) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setMsg(t("{n} question(s) linked to their skill.", { n: r.result.linked }));
    await load(data.page);
    router.refresh();
  }
  async function move(id: string) {
    const c = choice[id]; if (!c) { setError(t("Choose a skill first.")); return; }
    setBusy(true); setError(null);
    const r = await moveRowAction(id, c);
    setBusy(false);
    if (r.result === undefined) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setGone((s) => new Set(s).add(id));
  }
  async function leave(id: string) {
    setBusy(true); setError(null);
    const r = await leaveRowAction(id);
    setBusy(false);
    if (r.result === undefined) { setError(r.error ?? t("Something went wrong. Try again.")); return; }
    setGone((s) => new Set(s).add(id));
  }

  const rows = data ? data.rows.filter((r) => !gone.has(r.id)) : [];
  const nTicked = rows.filter((r) => ticked.has(r.id)).length;
  const label = g.label || t("No guess");
  return (
    <li className="rounded-2xl bg-white ring-1 ring-slate-200">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start">
        <span className="font-semibold text-brand-navy">{open ? "▾" : "▸"} {label}</span>
        <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-semibold text-slate-700">{g.count}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          {busy && !data && <p role="status" className="text-sm text-slate-600">{t("Loading…")}</p>}
          {data && (
            <>
              {g.label && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={acceptTicked} disabled={busy || !nTicked} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Accept the ticked ones")} ({nTicked})</button>
                  <button type="button" onClick={() => setTicked(new Set(nTicked === rows.length ? [] : rows.map((r) => r.id)))} className={BTN_SECONDARY}>{nTicked === rows.length ? t("Untick all") : t("Tick all")}</button>
                </div>
              )}
              <ul className="space-y-2">
                {rows.map((r) => {
                  const on = ticked.has(r.id) && !!r.guessId;
                  return (
                    <li key={r.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <label className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1 h-5 w-5" checked={on} disabled={!r.guessId} onChange={(e) => setTicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-slate-900" data-content lang="en">{r.excerpt}</span>
                          <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {r.grade ? <span>{t("Grade {n}", { n: r.grade })}</span> : null}
                            <span>{t("sure: {n}%", { n: Math.round(r.confidence * 100) })}</span>
                            {r.reason === "AI suggestion" && <span className="rounded-full bg-violet-100 px-2 text-violet-800">{t("AI suggestion")}</span>}
                          </span>
                        </span>
                      </label>
                      {!on && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 ps-8">
                          <Combo label={t("Move to…")} value={choice[r.id] ?? ""} onChange={(v) => setChoice((c) => ({ ...c, [r.id]: v }))} placeholder={t("Move to…")} options={(data.skillsByGrade[r.grade ?? 0] ?? []).map((k) => ({ value: k.id, label: k.name }))} className="w-72" />
                          <button type="button" onClick={() => move(r.id)} disabled={busy} className="min-h-11 rounded-lg bg-brand-navy px-4 font-semibold text-white disabled:opacity-60">{t("Save")}</button>
                          <button type="button" onClick={() => leave(r.id)} disabled={busy} className="min-h-11 rounded-lg bg-white px-4 font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-60">{t("Leave as it is")}</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {data.pages > 1 && (
                <nav aria-label={t("Pages")} className="mt-3 flex flex-wrap gap-2">
                  {Array.from({ length: Math.min(data.pages, 20) }, (_, i) => i + 1).map((p) => (
                    <button key={p} type="button" onClick={() => load(p)} disabled={busy} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold ${p === data.page ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{p}</button>
                  ))}
                </nav>
              )}
            </>
          )}
          {msg && <p role="status" className={STATUS}>✓ {msg}</p>}
          {error && <p role="alert" className={ALERT}>{t(error)}</p>}
        </div>
      )}
    </li>
  );
}
