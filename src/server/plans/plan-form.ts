/**
 * The shared form of the program pages' plan builder (MAP page, RTI page, Plans page), read the same way by the
 * page (GET, for the suggestion and the preview) and by the Send action (POST; the plan is built again on the
 * server from these fields — nothing from the browser is trusted beyond the teacher's choices).
 */
import { parseQuestionIdsField } from "../../components/skill-picker/helpers";
import { startOfDay } from "../../lib/assign-dates";

export interface PlanForm {
  classId: string;
  who: "class" | "student" | "group";
  /** chosen students (empty = whole class) */
  studentIds: string[];
  /** the suggested skills the teacher kept (null = all: the first view, or the options changed since) */
  keep: string[] | null;
  /** skills the teacher added (for every chosen student) */
  add: string[];
  step: "edit" | "preview";
  previewAs: string | null;
  q: string;
  title: string;
  note: string;
  dueAt: Date | null;
  dueText: string;
  /** r68: the start date (students see the plan's work from that day) */
  startAt: Date | null;
  startText: string;
  /** page options that change the suggestion (subject, areas…) */
  extra: string[];
  key: string;
  /** ⭐ "N students already mastered … — exclude them?": Yes (the default) leaves them out; xm=0 = No */
  excludeMastered: boolean;
  /** r74: the Source chosen next to the dates ("" until chosen: no default) */
  source: string;
}

/** The form field that carries the questions the teacher picked for one skill (the picker's hidden JSON field). */
export const pickField = (skillId: string) => `qids_${skillId}`;

/**
 * The teacher's picked questions of each skill of the plan ("I'll pick the questions"): skill id → ids. A skill
 * without picks is left out (the platform chooses at each student's level). The server checks the ids again.
 */
export function readQuestionPicks(get: (k: string) => string | null, skillIds: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of skillIds) { const ids = parseQuestionIdsField(get(pickField(id))); if (ids) out[id] = ids; }
  return out;
}

/** One key per set of options: the teacher's ticks count only while it stays the same. */
export const planKey = (classId: string, who: string, studentIds: string[], extra: string[] = []) => [classId, who, studentIds.join(","), ...extra].join("|");

export function readPlanForm(get: (k: string) => string | null, getAll: (k: string) => string[], extra: string[] = []): PlanForm {
  const who = get("who") === "student" || get("who") === "group" ? (get("who") as "student" | "group") : "class";
  const sids = [...new Set(getAll("sid").filter(Boolean))];
  const studentIds = who === "class" ? [] : who === "student" ? sids.slice(0, 1) : sids;
  const classId = String(get("classId") ?? "");
  const key = planKey(classId, who, studentIds, extra);
  const due = String(get("dueAt") ?? "");
  const start = String(get("startAt") ?? "");
  return {
    classId, who, studentIds, extra, key,
    keep: get("edited") === "1" && get("pkey") === key ? getAll("keep").filter(Boolean) : null,
    add: [...new Set(getAll("add").filter(Boolean))],
    step: get("step") === "preview" ? "preview" : "edit",
    previewAs: get("as") || null,
    q: String(get("q") ?? "").trim().slice(0, 80),
    title: String(get("title") ?? "").slice(0, 191),
    note: String(get("note") ?? "").slice(0, 1000),
    dueText: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
    dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null,
    startText: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : "",
    startAt: startOfDay(/^\d{4}-\d{2}-\d{2}$/.test(start) ? start : ""),
    excludeMastered: get("xm") !== "0",
    source: String(get("source") ?? "").slice(0, 16),
  };
}

/** Reads a Next.js searchParams object (string | string[]). */
export function fromSearchParams(sp: Record<string, string | string[] | undefined>): { get: (k: string) => string | null; getAll: (k: string) => string[] } {
  const all = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String); };
  return { get: (k) => all(k)[0] ?? null, getAll: all };
}

/** Reads a FormData (Send action). */
export function fromFormData(f: FormData): { get: (k: string) => string | null; getAll: (k: string) => string[] } {
  return { get: (k) => (f.get(k) === null ? null : String(f.get(k))), getAll: (k) => f.getAll(k).map(String) };
}
