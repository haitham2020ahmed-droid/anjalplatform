"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeHtml } from "./safe-html";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { canFullscreen } from "./start-writing-button";

type Status = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "GRADED";
interface LockState { status: Status; leaves: number; warning: boolean; deadline: string | null; serverNow: string; submitMode: string | null; text?: string }

/** One open per page load (React may run effects twice in development; the server also ignores a double open). */
const opened = new Map<string, number>();
const AUTOSAVE_MS = 5000;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const EXT_TAGS = "grammarly-desktop-integration, grammarly-extension, grammarly-popups, grammarly-mirror, [data-grammarly-shadow-root], lt-mirror, lt-toolbar, quillbot-extension, [data-quillbot-element]";
const EXT_ATTRS = ["data-gr-ext-installed", "data-new-gr-c-s-check-loaded", "data-gr-c-s-loaded", "data-new-gr-c-s-loaded", "data-lt-installed"];

/** A writing extension (Grammarly, LanguageTool, QuillBot…) that injected itself into the page, or null. */
function detectExtension(): string | null {
  const el = document.querySelector(EXT_TAGS);
  if (el) return el.tagName.toLowerCase() + (el.tagName.includes("-") ? "" : ` (${[...el.attributes].map((a) => a.name).find((n) => /grammarly|quillbot|lt-/.test(n)) ?? "attribute"})`);
  for (const node of [document.documentElement, document.body]) for (const a of EXT_ATTRS) if (node?.hasAttribute(a)) return a;
  return null;
}

/**
 * 🔒 The locked writing page: fullscreen, no menu or links; the only way out is “Submit Essay”. Autosaves every few
 * seconds and on every leave. Leaving (hidden tab, window blur, fullscreen exit; a reload is counted by the server)
 * is reported once per leave: the 1st time a warning, the 2nd time the server submits the essay. Without the
 * Fullscreen API (iPhone Safari) or inside Safe Exam Browser, “not fullscreen” never counts as leaving.
 */
export function LockedWriter({ taskId, title, promptHtml, minWords }: { taskId: string; title: string; promptHtml: string; minWords: number | null }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<LockState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<null | "warning" | "fullscreen">(null);
  const [confirm, setConfirm] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "offline">("saved");
  const [left, setLeft] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const textRef = useRef(""), dirty = useRef(false), active = useRef(false), lastLeave = useRef(0), lastFlag = useRef(0), offset = useRef(0), fs = useRef(false), timeUpSent = useRef(0);

  const post = useCallback(async (body: Record<string, unknown>, keepalive = false): Promise<LockState> => {
    const r = await fetch("/api/writing/locked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, ...body }), keepalive, cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as LockState & { error?: string };
    if (!r.ok) throw new Error(j.error || "The server did not answer. Your text is kept on this page.");
    return j;
  }, [taskId]);

  const apply = useCallback((s: LockState) => {
    setState(s);
    offset.current = new Date(s.serverNow).getTime() - Date.now();
    if (s.status !== "IN_PROGRESS") {
      active.current = false;
      setOverlay(null); setConfirm(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const flag = useCallback((kind: string, detail: string | null) => {
    const now = Date.now();
    if (kind !== "EXTENSION" && now - lastFlag.current < 1000) return;
    lastFlag.current = now;
    void post({ op: "flag", kind, detail }).then(apply, () => undefined);
  }, [post, apply]);

  /** One leave, reported once (blur + hidden + fullscreen exit fire together). */
  const leave = useCallback((kind: "HIDDEN" | "BLUR" | "FULLSCREEN") => {
    if (!active.current) return;
    const now = Date.now();
    if (now - lastLeave.current < 1500) return;
    lastLeave.current = now;
    dirty.current = false;
    void post({ op: "leave", kind, text: textRef.current }, true).then((s) => { apply(s); if (s.status === "IN_PROGRESS" && s.leaves >= 1) setOverlay("warning"); }, () => setSave("offline"));
  }, [post, apply]);

  // open the page (the server counts a reload as a leave)
  useEffect(() => {
    fs.current = canFullscreen();
    const last = opened.get(taskId) ?? 0;
    if (Date.now() - last < 5000) return;
    opened.set(taskId, Date.now());
    post({ op: "open" }).then((s) => {
      textRef.current = s.text ?? ""; setText(s.text ?? "");
      apply(s);
      if (s.status !== "IN_PROGRESS") return;
      active.current = true;
      if (s.leaves >= 1) setOverlay("warning");
      else if (fs.current && !document.fullscreenElement) setOverlay("fullscreen");
    }, (e: Error) => setFatal(e.message));
  }, [taskId, post, apply]);

  // leaving, copy / paste / drop / right-click, writing extensions
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") leave("HIDDEN"); };
    const onBlur = () => leave("BLUR");
    const onFs = () => { if (fs.current && !document.fullscreenElement) leave("FULLSCREEN"); };
    const block = (e: Event) => {
      if (!active.current) return;
      e.preventDefault();
      if (e.type === "paste") flag("PASTE", "Paste blocked");
      else if (e.type === "drop") flag("DROP", "Drop blocked");
    };
    const kinds = ["copy", "cut", "paste", "drop", "dragstart", "contextmenu"];
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    for (const k of kinds) document.addEventListener(k, block, true);
    let reported = false;
    const check = () => { if (reported || !active.current) return; const found = detectExtension(); if (found) { reported = true; flag("EXTENSION", found); } };
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: EXT_ATTRS });
    const first = window.setTimeout(check, 1500);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      for (const k of kinds) document.removeEventListener(k, block, true);
      mo.disconnect(); window.clearTimeout(first);
    };
  }, [leave, flag]);

  // autosave every few seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!active.current || !dirty.current) return;
      dirty.current = false; setSave("saving");
      post({ op: "save", text: textRef.current }).then((s) => { apply(s); setSave("saved"); }, () => { dirty.current = true; setSave("offline"); });
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [post, apply]);

  // the timer (the server decides; the page asks when its own clock reaches zero)
  useEffect(() => {
    if (!state?.deadline) { setLeft(null); return; }
    const end = new Date(state.deadline).getTime();
    const tick = () => {
      const sec = Math.max(0, Math.round((end - (Date.now() + offset.current)) / 1000));
      setLeft(sec);
      if (sec === 0 && active.current && Date.now() - timeUpSent.current > 3000) {
        timeUpSent.current = Date.now();
        post({ op: "timeup", text: textRef.current }).then(apply, () => undefined);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state?.deadline, post, apply]);

  const backToFullscreen = async () => {
    if (fs.current && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
    lastLeave.current = Date.now(); // coming back is not a new leave
    setOverlay(null);
  };

  async function submit() {
    setSending(true);
    active.current = false;
    try {
      const s = await post({ op: "submit", text: textRef.current });
      apply(s);
      router.replace(`/student/writing/${encodeURIComponent(taskId)}?msg=${encodeURIComponent("✅ Your essay was submitted.")}`);
    } catch (e) {
      active.current = true; setSending(false); setConfirm(false);
      setSave("offline");
      setNotice((e as Error).message);
    }
  }

  const n = words(text);
  const done = state && state.status !== "IN_PROGRESS";
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const big = "inline-flex min-h-12 items-center justify-center rounded-2xl px-6 text-base font-semibold";

  if (fatal && !state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-slate-200">
          <p className="text-lg font-semibold text-brand-navy">{t(fatal)}</p>
          <button type="button" onClick={() => router.replace(`/student/writing/${encodeURIComponent(taskId)}`)} className={`${big} mt-4 bg-brand-navy text-white`}>{t("Back to the task")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen select-none flex-col bg-slate-50">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="min-w-0 truncate text-lg font-semibold text-brand-navy">🔒 {title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          {left !== null && !done && <span dir="ltr" className={`rounded-full px-3 py-1 tabular-nums ${left <= 60 ? "bg-red-100 text-red-800" : left <= 300 ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`} aria-live="polite">⏱ {mmss(left)}</span>}
          <span className={`rounded-full px-3 py-1 tabular-nums ${minWords && n < minWords ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{t("{n} words", { n })}{minWords ? ` / ${minWords}` : ""}</span>
          {!done && <span className="text-xs text-slate-500">{save === "saving" ? t("Saving…") : save === "offline" ? t("Not saved yet — check the connection") : t("Saved")}</span>}
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 space-y-3 p-4">
        <details open className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <summary className="cursor-pointer font-semibold text-amber-950">{t("Writing prompt")}</summary>
          <SafeHtml className="prose-sm mt-2 text-amber-950 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6" html={promptHtml} />
        </details>

        {done ? (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="font-semibold text-brand-navy">{state!.status === "AUTO_SUBMITTED" ? (state!.submitMode === "TIME" ? t("Time is up: your essay was submitted automatically.") : t("You left the writing page a second time: your essay was submitted automatically.")) : t("Your essay was submitted.")}</p>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-lg leading-relaxed text-slate-900">{text || "—"}</p>
            <button type="button" onClick={() => router.replace(`/student/writing/${encodeURIComponent(taskId)}`)} className={`${big} mt-4 bg-brand-navy text-white`}>{t("Back to the task")}</button>
          </section>
        ) : (
          <>
            <label htmlFor="essay" className="sr-only">{t("Your essay")}</label>
            <textarea
              id="essay" value={text} disabled={!state || sending}
              onChange={(e) => { textRef.current = e.target.value; dirty.current = true; setText(e.target.value); }}
              spellCheck={false} autoCorrect="off" autoComplete="off" autoCapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
              maxLength={20000} rows={16}
              className="block min-h-[50vh] w-full select-text rounded-2xl border border-slate-300 bg-white p-4 text-lg leading-relaxed shadow-sm focus:border-brand-teal focus:outline-none"
              placeholder={t("Write your essay here…")}
            />
            {notice && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200">{t(notice)}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
              <p className="text-sm text-slate-600">{t("Stay on this page until you submit. Leaving it twice submits your essay automatically.")}</p>
              <button type="button" onClick={() => setConfirm(true)} disabled={!state || sending} className={`${big} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>📤 {t("Submit Essay")}</button>
            </div>
          </>
        )}
      </div>

      {confirm && !done && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-h" className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="confirm-h" className="text-xl font-semibold text-brand-navy">{t("Submit your essay?")}</h2>
            <p className="mt-2 text-slate-700">{t("After you submit, you cannot change it.")}</p>
            {minWords && n < minWords ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-900 ring-1 ring-amber-200">⚠️ {t("You wrote {n} words. The task asks for at least {m}.", { n, m: minWords })}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirm(false)} disabled={sending} className={`${big} bg-white text-brand-navy ring-1 ring-slate-300`}>{t("Keep writing")}</button>
              <button type="button" onClick={submit} disabled={sending} className={`${big} bg-emerald-600 text-white`}>{sending ? t("Sending…") : t("Submit Essay")}</button>
            </div>
          </div>
        </div>
      )}

      {overlay && !done && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="warn-h" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-xl">
            {overlay === "warning" ? (
              <>
                <p aria-hidden="true" className="text-4xl">⚠️</p>
                <h2 id="warn-h" className="mt-2 text-xl font-semibold text-red-800">{t("You left the writing page")}</h2>
                <p className="mt-2 text-slate-700">{t("Return now — next time your essay will be submitted automatically.")}</p>
              </>
            ) : (
              <>
                <p aria-hidden="true" className="text-4xl">🔒</p>
                <h2 id="warn-h" className="mt-2 text-xl font-semibold text-brand-navy">{t("Writing happens in full screen")}</h2>
                <p className="mt-2 text-slate-700">{t("Press the button to continue. Do not leave this page until you submit.")}</p>
              </>
            )}
            <button type="button" onClick={backToFullscreen} className={`${big} mt-4 w-full bg-brand-navy text-white`}>{fs.current ? t("Return to full screen") : t("Return to my essay")}</button>
          </div>
        </div>
      )}
    </main>
  );
}
