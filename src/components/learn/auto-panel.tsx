import Link from "next/link";
import { getT } from "@/i18n/server";
import { autoDecideAction, autoSwitchAction } from "@/app/teacher/learn/actions";
import type { AutoPanel as Panel } from "@/server/learn/auto";

const btn = "inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
const field = "mt-1 block min-h-9 rounded-lg border border-line bg-surface px-2 text-sm";
const STATUS: Record<string, string> = { SENT: "New", KEPT: "Kept", UNDONE: "Undone", CHANGED: "Changed" };

/**
 * 📘 "Sent automatically" (top of the teacher's Learn page): each automatic lesson with its students, the reason in plain
 * words and the evidence numbers → Keep / Undo (before the student starts) / Change lesson or level; the switches
 * (admin: the school; teacher: each class). Server component: plain forms, no script.
 */
export async function AutoPanel({ v }: { v: Panel }) {
  const { t } = await getT();
  const open = v.items.reduce((n, i) => n + i.open, 0);
  return (
    <details open={open > 0} className="mb-5 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
      <summary className="cursor-pointer font-semibold text-ink">
        📘 {t("Sent automatically")}{open > 0 && <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{t("{n} new", { n: open })}</span>}
        {!v.school && <span className="ms-2 text-xs font-normal text-muted">{t("Off for the school")}</span>}
      </summary>
      <p className="mt-2 text-sm text-ink-2">{t("Only you assign lessons, except when the platform sees a clear, strong problem on one skill: then it sends the lesson for that skill by itself (at most one a week per student). Keep it, undo it before the student starts, or change it.")}</p>
      {v.items.length ? (
        <ul className="mt-3 space-y-3">
          {v.items.map((it) => {
            const live = it.students.filter((x) => x.status === "SENT" || x.status === "KEPT");
            const names = it.students.map((x) => x.name);
            return (
              <li key={it.assignId} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <p className="text-sm text-ink">
                  <b>{t("Sent “{title}” to {names} ({n} students)", { title: it.title, names: names.slice(0, 5).join(", ") + (names.length > 5 ? " …" : ""), n: names.length })}</b>
                  <span className="text-muted"> · {it.className} · <span dir="ltr">{it.createdAt.slice(0, 10)}</span></span>
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {it.students.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{x.name}</span>
                      <span className="text-ink-2">— {t("why:")} {t(x.reason.key, x.reason.vars)}</span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs ring-1 ring-line">{t(STATUS[x.status] ?? x.status)}{x.started ? ` · ${t("Started")}` : ""}</span>
                      {x.note && <span className="text-xs text-muted" lang="en">{x.note}</span>}
                      {!x.started && (x.status === "SENT" || x.status === "KEPT") && (
                        <form action={autoDecideAction}><input type="hidden" name="what" value="undo" /><input type="hidden" name="ids" value={x.id} /><button className="text-xs font-semibold text-rose-800 underline">{t("Undo")}</button></form>
                      )}
                    </li>
                  ))}
                </ul>
                {live.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    {it.open > 0 && <form action={autoDecideAction}><input type="hidden" name="what" value="keep" />{live.map((x) => <input key={x.id} type="hidden" name="ids" value={x.id} />)}<button className={btn}>✔ {t("Keep")}</button></form>}
                    <form action={autoDecideAction}><input type="hidden" name="what" value="undo" />{live.map((x) => <input key={x.id} type="hidden" name="ids" value={x.id} />)}<button className={btn}>↩ {t("Undo")}</button></form>
                    <Link prefetch={false} href={`/teacher/learn/${it.ref}`} className={btn}>👀 {t("Preview")}</Link>
                    <details className="w-full sm:w-auto">
                      <summary className={`${btn} cursor-pointer`}>✏️ {t("Change lesson or level")}</summary>
                      <form action={autoDecideAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="what" value="change" />
                        {live.map((x) => <input key={x.id} type="hidden" name="ids" value={x.id} />)}
                        <label className="text-sm">{t("Lesson")}<input name="ref" list="auto-lessons" defaultValue={it.ref} className={field} dir="ltr" /></label>
                        <label className="text-sm">{t("Level")}<select name="level" defaultValue="" className={field}><option value="">{t("Automatic")}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                        <button className="min-h-9 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">{t("Save")}</button>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-sm text-muted">{t("Nothing was sent automatically in the last 2 weeks.")}</p>}
      <datalist id="auto-lessons">{v.lessons.map((l) => <option key={l.code} value={l.code}>{l.title}</option>)}</datalist>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
        {v.admin && (
          <form action={autoSwitchAction} className="flex items-center gap-2">
            <input type="hidden" name="on" value={v.school ? "0" : "1"} />
            <span>{t("School")}: <b>{v.school ? t("On") : t("Off")}</b></span>
            <button className={btn}>{v.school ? t("Turn off for the school") : t("Turn on for the school")}</button>
          </form>
        )}
        {v.classes.map((c) => (
          <form key={c.id} action={autoSwitchAction} className="flex items-center gap-2">
            <input type="hidden" name="classId" value={c.id} /><input type="hidden" name="on" value={c.on ? "0" : "1"} />
            <span>{c.name}: <b>{c.on ? t("On") : t("Off")}</b></span>
            <button className={btn}>{c.on ? t("Turn off") : t("Turn on")}</button>
          </form>
        ))}
      </div>
    </details>
  );
}
