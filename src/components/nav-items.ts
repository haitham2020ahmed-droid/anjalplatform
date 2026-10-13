import type { NavItem } from "./ui/main-nav";
import type { LineIconName } from "./ui/line-icon";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF } from "./admin-tools";

/** The side-menu group that starts folded for every role (rarely used pages). */
export const MORE = "More";
/** Kept for older imports: the admin's folded group is the same "More" as the other roles. */
export const MORE_TOOLS = MORE;

export interface NavOpts {
  /** the student is in the RTI program (Tier 2/3) */
  rti?: boolean;
  /** student: in a Grade 6 class (src/server/student/menu-flags.ts); teacher: teaches a Grade 6 class (NAFS) */
  nafs?: boolean;
}

/**
 * Each role's menu: short, tidy, the rare pages folded under "More". Labels are English source strings
 * (src/i18n/en.ts); the shell translates them. Pages taken out of the menu still open (see docs/WHAT-MOVED-WHERE.md).
 */
export function navItemsFor(role: string, opts: NavOpts = {}): NavItem[] {
  if (role === "TEACHER") return opts.nafs ? teacherMenuWithNafs() : TEACHER_MENU;
  if (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN") return adminMenu();
  if (role === "STUDENT") return studentMenu(opts);
  return [];
}

// ------------------------------------------------------------------ Student
/**
 * Five entries (owner's spec): Home · My Work · My Tests · MAP · ReadMaster / ReadRise — plus NAFS for students in a
 * Grade 6 class only (the NAFS center, owner-approved plan). No RTI wording.
 * Clean line icons (no emoji) and each page once: the home page's tiles open the rest (Curriculum Map, Second
 * Chance, Fluency Coach, Writing).
 */
function studentMenu(opts: NavOpts): NavItem[] {
  return [
    { href: "/student", label: "Home", icon: "🏠", line: "home" },
    { href: "/student/work", label: "My Work", icon: "📋", line: "work" },
    { href: "/student/tests", label: "My Tests", icon: "📝", line: "tests" },
    { href: "/student/map", label: "MAP", icon: "🗺️", line: "map" },
    { href: "/student/reading", label: "ReadMaster / ReadRise", icon: "📚", line: "reading" },
    // 🇸🇦 the NAFS icon: ONLY for students in a Grade 6 class (menu-flags.ts inGrade6Class)
    ...(opts.nafs ? [STUDENT_NAFS_PAGE] : []),
  ];
}
/** The student's NAFS icon: My practice · My tests · My results (Grade 6 students only). */
export const STUDENT_NAFS_PAGE: NavItem = { href: "/student/nafs", label: "NAFS", icon: "🇸🇦", line: "flag" };

// ------------------------------------------------------------------ Teacher
/**
 * Every teacher page lives in ONE place (owner's spec, Update 15): each area below is the only way in to its pages
 * (no Home tiles, hub cards or second menu entries repeat them). Reports = every report (MAP reports too) · MAP = MAP
 * results, score entry and the MAP practice test · Plans = every plan (MAP, NAFS, curriculum, support, custom) ·
 * Reading = ReadMaster, ReadRise and Reading Fluency. The tools used now and then sit under "More" (folded).
 * NAFS (its own entry, added by navItemsFor) is only for teachers of a Grade 6 class and admins:
 * src/server/teacher/nafs-access.ts.
 */
export const TEACHER_MENU: NavItem[] = [
  { href: "/teacher", label: "Home", icon: "🏠", line: "home" },
  { href: "/teacher/students", label: "Students & Classes", icon: "👥", line: "users" },
  { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", line: "compass" },
  { href: "/teacher/plans", label: "Plans", icon: "🗂️", line: "plans" },
  { href: "/teacher/assessments", label: "Assessments", icon: "📝", line: "check" },
  { href: "/teacher/writing", label: "Writing", icon: "🖊", line: "pen" },
  { href: "/teacher/reading", label: "Reading", icon: "📚", line: "book" },
  { href: "/teacher/map-center", label: "MAP", icon: "🗺️", line: "target" },
  { href: "/teacher/reports", label: "Reports", icon: "📊", line: "chart" },
  { href: "/teacher/week", label: "My Week", icon: "📅", line: "week", group: MORE },
  { href: "/teacher/messages", label: "Messages", icon: "📨", line: "mail", group: MORE },
  { href: "/teacher/games", label: "Live Challenge", icon: "🏁", line: "game", group: MORE },
  { href: "/teacher/calendar", label: "Calendar", icon: "🗓️", line: "calendar", group: MORE },
  { href: "/guide", label: "Help", icon: "❔", line: "help", group: MORE },
];
/**
 * 🇸🇦 NAFS: its OWN menu entry (owner's spec), after Assessments, only for teachers of a Grade 6 class
 * (src/server/teacher/nafs-access.ts); admins find it by name. The section's tabs: About NAFS · Skills · Question
 * bank · Tests · Bubble sheets · Reports.
 */
export const NAFS_PAGE: NavItem = { href: "/teacher/nafs", label: "NAFS", icon: "🇸🇦", line: "flag" };
/** The NAFS plan (a tab of Plans, also linked from the NAFS section's Reports): found by name by the same people. */
export const NAFS_PLAN_PAGE: NavItem = { href: "/teacher/plans?tab=nafs", label: "NAFS plan", icon: "🧾" };
function teacherMenuWithNafs(): NavItem[] {
  const at = TEACHER_MENU.findIndex((i) => i.href === "/teacher/assessments") + 1;
  return [...TEACHER_MENU.slice(0, at), NAFS_PAGE, ...TEACHER_MENU.slice(at)];
}

/**
 * Pages that left a menu but still open (docs/WHAT-MOVED-WHERE.md): "Find a page" in the side menu still finds
 * them by name, so nobody loses a page they knew.
 */
const OFF_MENU: Record<"TEACHER" | "STUDENT", NavItem[]> = {
  TEACHER: [
    { href: "/teacher/plans/support", label: "Support (RTI)", icon: "🛟" },
    { href: "/teacher/rti-plan", label: "Weekly Support Sessions", icon: "🗓" },
    { href: "/teacher/groups", label: "Groups", icon: "🤝" },
    { href: "/teacher/diagnostic", label: "Diagnostic Test", icon: "🩺" },
    { href: "/teacher/progress-checks", label: "Progress Checks", icon: "✅" },
    { href: "/teacher/decoding", label: "Decoding Screener", icon: "🔡" },
    { href: "/teacher/fluency", label: "Reading Fluency", icon: "🔊" },
    { href: "/teacher/readrise", label: "ReadRise", icon: "🚀" },
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐" },
    { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨" },
    { href: "/teacher/lessons", label: "Intervention Lessons", icon: "🧩" },
    { href: "/teacher/respond", label: "Respond to Reading", icon: "✍️" },
    { href: "/admin/dictionary", label: "Dictionary", icon: "📖" },
    { href: "/admin/grammar", label: "Grammar", icon: "🔤" },
    { href: "/teacher/word-journal", label: "Word Journals", icon: "📒" },
    { href: "/teacher/intervention", label: "Who Needs Help", icon: "🚨" },
    { href: "/teacher/alerts", label: "Alerts", icon: "🔔" },
    { href: "/teacher/ai", label: "Class Insights", icon: "💡" },
    { href: "/teacher/family-reports", label: "Family Reports", icon: "👪" },
    { href: "/teacher/assignments", label: "Assignments", icon: "📋" },
    { href: "/teacher/map-rit", label: "MAP Scores", icon: "📥" },
    { href: "/teacher/progress", label: "Students dashboard", icon: "📈" },
    { href: "/teacher/map-center?tab=plan", label: "MAP plan", icon: "🧾" },
    { href: "/teacher/map-center?tab=reports", label: "MAP reports", icon: "📑" },
    { href: "/teacher/levels", label: "Levels", icon: "🎚" },
    { href: "/teacher/intervention/groups", label: "Intervention Groups", icon: "🎯" },
    { href: "/teacher/strategy-groups", label: "Strategy Groups", icon: "🧠" },
    { href: "/teacher/learning-loop", label: "Teach · Check · Reteach", icon: "🔄" },
    { href: "/teacher/knowledge-graph", label: "Skill Connections", icon: "🕸️" },
  ],
  STUDENT: [
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", line: "star" },
    { href: "/student/readrise", label: "ReadRise", icon: "🚀", line: "rise" },
    { href: "/student/fluency-coach", label: "Fluency Coach", icon: "🎙️", line: "mic" },
    { href: "/student/curriculum", label: "Curriculum Map", icon: "🧭", line: "curriculum" },
    { href: "/student/second-chance", label: "Second Chance", icon: "🌟", line: "retry" },
    { href: "/student/certificates", label: "My Certificates", icon: "📜", line: "award" },
    { href: "/student/badges", label: "Badges", icon: "🏅" },
    { href: "/student/reports", label: "My Reports", icon: "📊" },
    { href: "/student/lesson", label: "My Lessons", icon: "📘" },
    { href: "/student/words", label: "My Words", icon: "📒", line: "words" },
    { href: "/student/respond", label: "Respond to Reading", icon: "✍️", line: "writing" },
    { href: "/student/writing", label: "Writing", icon: "🖊", line: "writing" },
    { href: "/student/decoding", label: "Word Sounds Check", icon: "🔤" },
    { href: "/student/strategy-survey", label: "My Reading Strategies", icon: "🧠" },
    { href: "/student/insights", label: "Progress Report", icon: "🌟" },
    { href: "/student/skills", label: "My Skills", icon: "🧩" },
    { href: "/student/family", label: "Family Report", icon: "👪" },
    { href: "/play", label: "Join Live", icon: "🎮" },
    { href: "/guide", label: "Help", icon: "❔" },
  ],
};

/** Every page a role can find by name: the menu, then the pages that left it (no duplicates). */
export function searchablePagesFor(role: string, opts: NavOpts = {}): NavItem[] {
  const menu = navItemsFor(role, opts);
  const extra = role === "TEACHER" ? [...OFF_MENU.TEACHER, ...(opts.nafs ? [NAFS_PLAN_PAGE] : [])] : role === "STUDENT" ? OFF_MENU[role]
    : role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" ? [...adminOffMenu(), NAFS_PAGE, NAFS_PLAN_PAGE] : [];
  const seen = new Set(menu.map((i) => i.href));
  return [...menu, ...extra.filter((i) => !seen.has(i.href))];
}

// ------------------------------------------------------------------ Admin
/**
 * Home · All Admin Tools, then the five sections (≤ 6 working tools each). Nothing is folded under "More": every
 * other admin tool is on All Admin Tools (searchable) and in the top bar's "Find a page" (adminOffMenu).
 */
function adminMenu(): NavItem[] {
  return [
    { href: "/admin", label: "Home", icon: "🏠", line: "home" },
    { href: ALL_TOOLS_HREF, label: "All Admin Tools", icon: "🧰", line: "tools" },
    ...ADMIN_GROUPS.flatMap((g) => ADMIN_TOOLS.filter((x) => x.menu && x.group === g.key).map((x) => ({ href: x.href, label: x.label, icon: x.icon, group: g.title, line: ADMIN_LINE[x.href] }))),
  ];
}

/** The admin menu's calm line icons (Literise D1: no emoji in any menu), by page address. */
export const ADMIN_LINE: Record<string, LineIconName> = {
  "/admin/school": "school", "/admin/users": "users", "/teacher/students": "search", "/admin/teachers": "teacher",
  "/admin/questions": "question", "/admin/skill-links": "layers", "/admin/curriculum-map": "compass", "/admin/readrise": "rise",
  "/student/readmaster": "star", "/admin/grammar": "words", "/admin/tests": "tests", "/admin/diagnostic": "check",
  "/teacher/map-center": "target", "/admin/nafs-links": "link", "/admin/levels": "scale", "/teacher/rti-plan": "calendar",
  "/admin/analytics": "growth", "/admin/term-report": "file", "/admin/report-approvals": "inbox", "/teacher/reports": "chart",
  "/admin/department": "building", "/admin/ai-dashboard": "sparkle", "/admin/settings": "settings", "/admin/ai-tools": "sparkle",
  "/admin/backup": "download", "/admin/data-health": "heart", "/admin/data-cleanup": "broom", "/admin/feedback": "chat",
};

/** The admin tools that are not in the side menu (found by name in the top bar). */
function adminOffMenu(): NavItem[] {
  return ADMIN_TOOLS.filter((x) => !x.menu).map((x) => ({ href: x.href, label: x.label, icon: x.icon }));
}

/** The menu in its own order: a run of items of the same group is one section (items without a group stand alone). */
export function navSections(items: NavItem[]): { name: string | null; items: NavItem[] }[] {
  const out: { name: string | null; items: NavItem[] }[] = [];
  for (const i of items) {
    const key = i.group ?? null;
    const last = out[out.length - 1];
    if (last && last.name === key) last.items.push(i); else out.push({ name: key, items: [i] });
  }
  return out;
}
