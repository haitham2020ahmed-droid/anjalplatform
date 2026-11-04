/**
 * 🔗 Clickable plans (owner r79 §B): "In ANY plan — MAP, NAFS, Curriculum, RTI, any plan — when I download the PDF I can
 * click any lesson or skill and it opens the platform on that skill and its practice."
 *
 * ONE helper builds every link printed in a plan (PDF, Word, browser print):
 *   · ABSOLUTE, from APP_URL (a PDF or a paper copy has no "current page" to resolve a relative link against)
 *   · to the right page for the reader:  student / family → practise that skill, open that lesson or plan step
 *                                        staff            → the skill page (⭐ Assign, questions, worksheet) or the
 *                                                           teacher's lesson / Curriculum Map page
 *   · ids only (skill id, lesson code, plan id): never a name, a token or anything personal
 * Not signed in → the platform's sign-in page, then straight back to the same page (middleware `?next=`, the sign-in
 * form's `safeNext`: any internal page path except /login and /api — every path built here qualifies).
 * Chromium keeps `<a href>` with an absolute URL as a clickable link in the PDF; Word keeps it in the .doc.
 * For paper copies, a plan section / unit heading carries one small QR code of the same link (planQrSvg).
 *
 * No server imports: page components, report renderers and the Word export all use it.
 */
import { qrPath } from "./qr";

export type PlanAudience = "student" | "family" | "staff";

export type PlanItem =
  /** a platform skill: student → adaptive practice; staff → the skill page */
  | { kind: "skill"; id: string; from?: "map" | "free" | "plan" }
  /** a Learn lesson (code "LN-123"): student → the lesson; staff → the teacher's lesson page */
  | { kind: "lesson"; code: string }
  /** one step of a student's sent study plan (student only; staff → the plan's page) */
  | { kind: "plan-step"; planId: string; itemId: string }
  /** a student's MAP plan */
  | { kind: "map-plan"; id: string }
  /** a Curriculum Map unit of a grade: student → my Curriculum page; staff → the Curriculum Map on that unit */
  | { kind: "curriculum-unit"; grade: number; unit: number }
  /** an assignment (quiz): student → take it; staff → the assignment's results */
  | { kind: "assignment"; id: string }
  /** a class's MAP Year plan: student → my MAP Year plan tab; staff → the class's Year plan */
  | { kind: "year-plan"; classId: string }
  /** a student's Personal Study Plan (MAP): the same page for everyone allowed to read it */
  | { kind: "study-plan"; studentId: string; subject: "READING" | "LANGUAGE" }
  /** the NAFS practice: student → my NAFS page; staff → the NAFS center */
  | { kind: "nafs" }
  /** a class's MAP group plan (Personalized plan): staff → the class's MAP plan tab; student → my MAP page */
  | { kind: "map-group-plan"; classId: string; subject: "READING" | "LANGUAGE" };

const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const DEFAULT_ORIGIN = "http://localhost:3000";

/** The platform's own origin (APP_URL), e.g. "https://literise.example.org". */
export function appOrigin(appUrl: string | undefined = typeof process !== "undefined" ? process.env.APP_URL : undefined): string {
  try { const u = new URL(String(appUrl ?? "").trim()); if (u.protocol === "https:" || u.protocol === "http:") return u.origin; } catch { /* not set: local development */ }
  return DEFAULT_ORIGIN;
}

/** The page PATH of an item for a reader (null: nothing to link, e.g. a malformed id). */
export function planPath(item: PlanItem, audience: PlanAudience): string | null {
  const staff = audience === "staff";
  const e = encodeURIComponent;
  switch (item.kind) {
    case "skill":
      if (!ID.test(item.id)) return null;
      return staff ? `/skill/${e(item.id)}` : `/practice/${e(item.id)}${item.from ? `?from=${item.from}` : ""}`;
    case "lesson":
      if (!ID.test(item.code)) return null;
      return staff ? `/teacher/learn/${e(item.code)}` : `/student/learn/${e(item.code)}`;
    case "plan-step":
      if (!ID.test(item.planId) || !ID.test(item.itemId)) return null;
      return staff ? `/teacher/plans/${e(item.planId)}` : `/student/plans/${e(item.planId)}/open/${e(item.itemId)}`;
    case "map-plan":
      return ID.test(item.id) ? `/map-plan/${e(item.id)}` : null;
    case "curriculum-unit": {
      const g = Math.trunc(Number(item.grade)), u = Math.trunc(Number(item.unit));
      if (!(g >= 1 && g <= 12) || !(u >= 1 && u <= 20)) return null;
      return staff ? `/admin/curriculum-map?grade=${g}&unit=${u}` : `/student/curriculum`;
    }
    case "assignment":
      if (!ID.test(item.id)) return null;
      return staff ? `/teacher/assignments/${e(item.id)}` : `/quiz/${e(item.id)}`;
    case "year-plan":
      if (!ID.test(item.classId)) return null;
      return staff ? `/teacher/map-center?tab=year&classId=${e(item.classId)}` : `/student/map?tab=year`;
    case "study-plan":
      if (!ID.test(item.studentId)) return null;
      return `/map-report/study-plan/${e(item.studentId)}?subject=${item.subject === "LANGUAGE" ? "LANGUAGE" : "READING"}`;
    case "nafs":
      return staff ? `/teacher/nafs` : `/student/nafs`;
    case "map-group-plan":
      if (!ID.test(item.classId)) return null;
      return staff ? `/teacher/map-center?tab=plan&classId=${e(item.classId)}&subject=${item.subject === "LANGUAGE" ? "LANGUAGE" : "READING"}` : `/student/map`;
  }
}

/** The ABSOLUTE link of an item for a reader (null: nothing to link). */
export function planHref(item: PlanItem, audience: PlanAudience, origin = appOrigin()): string | null {
  const p = planPath(item, audience);
  return p ? `${origin}${p}` : null;
}

/** An internal page path already built by the platform (e.g. a plan step's `href`) → its absolute link (null if not safe). */
export function absolutePlanPath(path: string | null | undefined, origin = appOrigin()): string | null {
  const p = String(path ?? "");
  if (!/^\/(?![\/\\])[A-Za-z0-9_\-./%?=&:+#]*$/.test(p) || p.length > 300 || p.startsWith("/login") || p.startsWith("/api")) return null;
  return `${origin}${p}`;
}

/**
 * A link may be printed only when it is the platform's own page: starts with the APP_URL origin + "/", no spaces,
 * quotes or angle brackets, no user info, bounded length. Anything else is printed as plain text.
 */
export function isPlanHref(href: unknown, origin = appOrigin()): href is string {
  if (typeof href !== "string" || href.length > 400 || !href.startsWith(`${origin}/`)) return false;
  const rest = href.slice(origin.length);
  return /^\/(?![\/\\])[A-Za-z0-9_\-./%?=&:+#]*$/.test(rest) && !rest.startsWith("/login") && !rest.startsWith("/api");
}

/** The note at the top of every plan with links. */
export const PLAN_LINKS_NOTE = { en: "🔗 Everything in this plan is clickable", ar: "🔗 كل ما في هذه الخطة قابل للنقر" } as const;
export const PLAN_QR_NOTE = { en: "Scan to open", ar: "امسح للفتح" } as const;

/** One small QR code (inline SVG, black on white) of a plan link — for paper copies. Empty string if the link is not safe. */
export function planQrSvg(href: string, sizePx = 58, origin = appOrigin()): string {
  if (!isPlanHref(href, origin)) return "";
  try {
    const q = qrPath(href);
    return `<svg class="plan-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${q.total} ${q.total}" width="${sizePx}" height="${sizePx}" role="img" aria-label="QR"><rect width="${q.total}" height="${q.total}" fill="#fff"/><path d="${q.d}" fill="#000"/></svg>`;
  } catch { return ""; }
}
