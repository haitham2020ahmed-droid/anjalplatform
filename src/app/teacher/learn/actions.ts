"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { getT } from "@/i18n/server";
import { leaves, setLeaf, type LevelKey, type LLevel, type WordCard } from "@/lib/learn/format";
import { closeReport, decideEdit, hasLevelWord, lessonLevelFor, reportProblem, restoreOriginal, saveLessonEdit, saveWordEdit, setLessonHidden, teacherIdOf } from "@/server/learn/edits";
import { assignLearn, type AssignTarget } from "@/server/learn/teacher";
import { aiWordDraft, findSelection, selectionWords } from "@/server/learn/words";
import { changeAuto, keepAuto, setAutoSwitch, undoAuto } from "@/server/learn/auto";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
/** Only paths inside the Learn pages (never another site). */
const safeBack = (v: string, fb: string) => (/^\/teacher\/learn(?:[/?#]|$)/.test(v) ? v : fb);
const withMsg = (url: string, msg: string, key = "msg") => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

async function run(back: string, work: () => Promise<string>): Promise<never> {
  const { t } = await getT();
  let to: string;
  try { to = withMsg(back, t(await work())); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to = withMsg(back, e.message, "err"); else throw e; }
  redirect(to);
}

/** ✏️ Save an edit of one lesson level: every text field of the form ("f:<path>") over the version the teacher saw. */
export async function saveLessonEditAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const code = f(d, "code"), level = f(d, "level") as LevelKey;
  return run(`/teacher/learn/${encodeURIComponent(code)}?level=${level}`, async () => {
    const tid = await teacherIdOf(repo, actor);
    const cur = await lessonLevelFor(repo, String(actor.schoolId), code, level, tid ? [tid] : [], tid);
    if (!cur) throw new ValidationError("This lesson is not on the platform.");
    let next: LLevel = cur.level;
    for (const [path] of leaves(cur.level)) { const v = d.get(`f:${path}`); if (v !== null) next = setLeaf(next, path, String(v)); }
    const bad = hasLevelWord(next);
    if (bad) throw new ValidationError(`Students never see level words: please remove “${bad}”.`);
    const r = await saveLessonEdit(repo, actor, code, level, next);
    return r.status === "APPROVED" ? "Saved: this is now the school's version." : "Saved: your classes see your version now. The admin will review it.";
  });
}

/** ↺ Restore original (teacher: their own version; admin: the school's version). */
export async function restoreLessonAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const code = f(d, "code"), level = f(d, "level");
  return run(`/teacher/learn/${encodeURIComponent(code)}?level=${level}`, async () => { await restoreOriginal(repo, actor, "LESSON", code, Number(level)); return "The original lesson is back."; });
}

/** ⚑ Report a problem (lesson or word). */
export async function reportAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const kind = f(d, "kind") === "WORD" ? "WORD" : "LESSON";
  return run(safeBack(f(d, "back"), "/teacher/learn"), async () => { await reportProblem(repo, actor, kind, f(d, "ref"), Number(f(d, "level")) || 0, f(d, "text")); return "Thank you. The admin will look at it."; });
}

/** Admin: Hide / Show a lesson. */
export async function hideLessonAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const code = f(d, "code"), hide = f(d, "hidden") === "1";
  return run(safeBack(f(d, "back"), `/teacher/learn/${encodeURIComponent(code)}`), async () => { await setLessonHidden(repo, actor, code, hide, f(d, "reason") || null); return hide ? "The lesson is hidden until it is fixed." : "The lesson is shown again."; });
}

/** Assign a lesson or a selection's words to a class, a group or students. */
export async function assignAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const kind = f(d, "kind") === "WORDS" ? "WORDS" : "LESSON";
  const ref = f(d, "ref");
  const back = safeBack(f(d, "back"), `/teacher/learn/assign?${new URLSearchParams({ kind, ref })}`);
  return run(back, async () => {
    const due = f(d, "dueAt");
    const sel = kind === "WORDS" ? findSelection(ref) : null;
    if (kind === "WORDS" && !sel) throw new ValidationError("Unknown selection.");
    const r = await assignLearn(repo, actor, {
      kind, ref, title: sel ? `Grade ${sel.grade} · Unit ${sel.unit} · ${sel.name}` : undefined, classId: f(d, "classId"), target: (f(d, "target") || "CLASS") as AssignTarget,
      groupLevel: f(d, "groupLevel") || null, studentIds: d.getAll("studentIds").map(String), level: Number(f(d, "level")) || null, dueAt: due ? new Date(`${due}T23:59:00`) : null,
    });
    const { t } = await getT();
    return t("Assigned to {n} student(s).", { n: r.students }) + (r.already ? ` ${t("{n} already had it.", { n: r.already })}` : "");
  });
}

/** Admin: Approve / Reject a teacher's proposal. */
export async function decideEditAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const approve = f(d, "approve") === "1";
  return run("/teacher/learn/review", async () => { await decideEdit(repo, actor, f(d, "id"), approve, f(d, "note") || null); return approve ? "Approved: it is now the school's version." : "Rejected: it stays the teacher's own version."; });
}

/** Admin: a problem report is dealt with. */
export async function closeReportAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  return run("/teacher/learn/review", async () => { await closeReport(repo, actor, f(d, "id")); return "Marked as done."; });
}

/** ✏️ Save a word card (an edit, a first explanation, or a new word of the selection). */
export async function saveWordAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const sel = findSelection(f(d, "sel"));
  const back = `/teacher/learn/words?sel=${encodeURIComponent(f(d, "sel"))}`;
  return run(back, async () => {
    if (!sel) throw new ValidationError("Unknown selection.");
    const word = f(d, "word").slice(0, 64);
    if (!word) throw new ValidationError("Write the word.");
    const list = (k: string) => f(d, k).split(",").map((x) => x.trim()).filter(Boolean).slice(0, k === "family" ? 8 : 3);
    const card: WordCard = {
      word, pos: f(d, "pos"), meaning: f(d, "meaning"), example: f(d, "example"), arabic: f(d, "arabic"), synonyms: list("synonyms"), antonyms: list("antonyms"), family: list("family"),
      check: { stem: f(d, "stem"), options: [0, 1, 2, 3].map((i) => f(d, `opt${i}`)), answer: Number(f(d, "answer")) },
    };
    const bad = hasLevelWord({ ...card, arabic: "" });
    if (bad) throw new ValidationError(`Students never see level words: please remove “${bad}”.`);
    // the admin compares with the school's version (approved card or the file)
    const view = await selectionWords(repo, String(actor.schoolId), sel, [], null);
    const base = view.words.find((w) => w.word.toLowerCase() === word.toLowerCase())?.card ?? null;
    const r = await saveWordEdit(repo, actor, `${sel.key}|${word.toLowerCase()}`, card, base);
    return r.status === "APPROVED" ? "Saved: this is now the school's version." : "Saved: your classes see your version now. The admin will review it.";
  });
}

/** ↺ Restore a word (teacher: their own version; admin: the school's version). */
export async function restoreWordAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  return run(`/teacher/learn/words?sel=${encodeURIComponent(f(d, "sel"))}`, async () => { await restoreOriginal(repo, actor, "WORD", f(d, "key"), 0); return "The original word card is back."; });
}

/** ✨ AI draft of a word card (only the word and the selection's topic are sent; nothing is saved). */
export async function aiWordDraftAction(sel: string, word: string): Promise<{ ok: true; card: WordCard } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return await aiWordDraft(repo, actor, String(sel), String(word), aiEnv()); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** 📘 Sent automatically: Keep / Undo / Change lesson or level (one student or the whole item). */
export async function autoDecideAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const ids = d.getAll("ids").map(String);
  const what = f(d, "what");
  return run("/teacher/learn", async () => {
    const { t } = await getT();
    if (what === "keep") { await keepAuto(repo, actor, ids); return "Kept."; }
    if (what === "undo") {
      const r = await undoAuto(repo, actor, ids);
      return t("Removed from {n} student(s).", { n: r.undone }) + (r.started ? ` ${t("{n} had already started: kept.", { n: r.started })}` : "");
    }
    if (what === "change") {
      const r = await changeAuto(repo, actor, ids, f(d, "ref"), Number(f(d, "level")) || null);
      return t("Changed for {n} student(s).", { n: r.changed }) + (r.started ? ` ${t("{n} had already started: kept.", { n: r.started })}` : "");
    }
    throw new ValidationError("Choose what to do.");
  });
}

/** 📘 Automatic lessons on / off: the school (admin) or one class (its teacher). */
export async function autoSwitchAction(d: FormData): Promise<void> {
  const actor = await requireActor({ roles: [...STAFF] });
  const on = f(d, "on") === "1";
  return run("/teacher/learn", async () => { await setAutoSwitch(repo, actor, f(d, "classId") || null, on); return on ? "Automatic lessons are on." : "Automatic lessons are off."; });
}
