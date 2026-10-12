import type { NavItem } from "./ui/main-nav";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF } from "./admin-tools";

/** The side-menu group that starts folded for every role (rarely used pages). */
export const MORE = "More";
/** Kept for older imports: the admin's folded group is the same "More" as the other roles. */
export const MORE_TOOLS = MORE;

export interface NavOpts {
  /** the student is in the RTI program (Tier 2/3) */
  rti?: boolean;
  /** the student has NAFS work / results (src/server/student/menu-flags.ts) */
  nafs?: boolean;
}

/**
 * Each role's menu: short, tidy, the rare pages folded under "More". Labels are English source strings
 * (src/i18n/en.ts); the shell translates them. Pages taken out of the menu still open (see docs/WHAT-MOVED-WHERE.md).
 */
export function navItemsFor(role: string, opts: NavOpts = {}): NavItem[] {
  if (role === "TEACHER") return TEACHER_MENU;
  if (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN") return adminMenu();
  if (role === "STUDENT") return studentMenu(opts);
  return [];
}

// ------------------------------------------------------------------ Student
function studentMenu(opts: NavOpts): NavItem[] {
  return [
    { href: "/student", label: "My Work", icon: "🏠" },
    // Programs (RTI only for students in Tier 2/3; NAFS only when the student has NAFS work)
    { href: "/student/map", label: "MAP", icon: "🗺️", group: "Programs" },
    { href: "/student/curriculum", label: "Curriculum Map", icon: "🧭", group: "Programs" },
    ...(opts.rti ? [{ href: "/student/rti", label: "RTI", icon: "🛟", group: "Programs" }] : []),
    ...(opts.nafs ? [{ href: "/student/nafs", label: "NAFS", icon: "🎓", group: "Programs" }] : []),
    // Reading
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", group: "Reading" },
    { href: "/student/readrise", label: "ReadRise", icon: "🚀", group: "Reading" },
    { href: "/student/fluency-coach", label: "Fluency Coach", icon: "🎙️", group: "Reading" },
    // Achievements
    { href: "/student/second-chance", label: "Second Chance", icon: "🌟", group: "Achievements" },
    { href: "/student/tests", label: "My Tests", icon: "📝", group: "Achievements" },
    { href: "/student/certificates", label: "My Certificates", icon: "📜", group: "Achievements" },
    { href: "/student/badges", label: "Badges", icon: "🏅", group: "Achievements" },
    { href: "/student/reports", label: "My Reports", icon: "📊" },
    // More (folded)
    { href: "/student/lesson", label: "My Lessons", icon: "📘", group: MORE },
    { href: "/student/review", label: "Review", icon: "🔁", group: MORE },
    { href: "/student/words", label: "My Words", icon: "📒", group: MORE },
    { href: "/student/respond", label: "Respond to Reading", icon: "✍️", group: MORE },
    { href: "/student/writing", label: "Writing", icon: "🖊", group: MORE },
    { href: "/student/decoding", label: "Word Sounds Check", icon: "🔤", group: MORE },
    { href: "/student/strategy-survey", label: "My Reading Strategies", icon: "🧠", group: MORE },
    { href: "/guide", label: "Help", icon: "❔", group: MORE },
  ];
}

// ------------------------------------------------------------------ Teacher
const TEACHER_MENU: NavItem[] = [
  { href: "/teacher", label: "Home", icon: "🏠" },
  { href: "/teacher/students", label: "My Students", icon: "👥" },
  { href: "/teacher/map-center", label: "MAP", icon: "🗺️", group: "Programs" },
  { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", group: "Programs" },
  { href: "/teacher/rti-plan", label: "RTI", icon: "🛟", group: "Programs" },
  { href: "/teacher/plans", label: "Plans", icon: "🗂️", group: "Programs" },
  { href: "/teacher/assessments", label: "Assessments", icon: "📝" },
  { href: "/teacher/games", label: "Live Challenge", icon: "🏁" },
  { href: "/teacher/reports", label: "Reports", icon: "📊" },
  { href: "/teacher/week", label: "My Week", icon: "📅" },
  { href: "/teacher/messages", label: "Messages", icon: "📨" },
  // More (folded): every other page that is still useful
  { href: "/teacher/tiers", label: "Support Tiers", icon: "🪜", group: MORE },
  { href: "/teacher/groups", label: "Groups", icon: "🤝", group: MORE },
  { href: "/teacher/data-meeting", label: "Data Meeting", icon: "🗃", group: MORE },
  { href: "/teacher/diagnostic", label: "Diagnostic Test", icon: "🩺", group: MORE },
  { href: "/teacher/progress-checks", label: "Progress Checks", icon: "✅", group: MORE },
  { href: "/teacher/decoding", label: "Decoding Screener", icon: "🔡", group: MORE },
  { href: "/teacher/fluency", label: "Reading Fluency", icon: "🔊", group: MORE },
  { href: "/teacher/readrise", label: "ReadRise", icon: "🚀", group: MORE },
  { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", group: MORE },
  { href: "/teacher/lessons", label: "Intervention Lessons", icon: "🧩", group: MORE },
  { href: "/teacher/writing", label: "Writing & Reading Aloud", icon: "🖊", group: MORE },
  { href: "/teacher/respond", label: "Respond to Reading", icon: "✍️", group: MORE },
  { href: "/admin/dictionary", label: "Dictionary", icon: "📖", group: MORE },
  { href: "/admin/grammar", label: "Grammar", icon: "🔤", group: MORE },
  { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", group: MORE },
  { href: "/teacher/calendar", label: "Calendar", icon: "🗓️", group: MORE },
  { href: "/teacher/word-journal", label: "Word Journals", icon: "📒", group: MORE },
  { href: "/guide", label: "Help", icon: "❔", group: MORE },
];

/**
 * Pages that left a menu but still open (docs/WHAT-MOVED-WHERE.md): the top bar's "Find a page" and the search
 * still find them by name, so nobody loses a page they knew.
 */
const OFF_MENU: Record<"TEACHER" | "STUDENT", NavItem[]> = {
  TEACHER: [
    { href: "/teacher/progress", label: "Student Progress", icon: "📈" },
    { href: "/teacher/intervention", label: "Who Needs Help", icon: "🚨" },
    { href: "/teacher/alerts", label: "Alerts", icon: "🔔" },
    { href: "/teacher/ai", label: "Class Insights", icon: "💡" },
    { href: "/teacher/family-reports", label: "Family Reports", icon: "👪" },
    { href: "/teacher/assignments", label: "Assignments", icon: "📋" },
    { href: "/teacher/map-rit", label: "MAP Scores", icon: "📥" },
    { href: "/teacher/map-plans", label: "MAP Plans", icon: "🧾" },
    { href: "/teacher/levels", label: "Levels", icon: "🎚" },
    { href: "/teacher/intervention/groups", label: "Intervention Groups", icon: "🎯" },
    { href: "/teacher/strategy-groups", label: "Strategy Groups", icon: "🧠" },
    { href: "/teacher/learning-loop", label: "Teach · Check · Reteach", icon: "🔄" },
    { href: "/teacher/knowledge-graph", label: "Skill Connections", icon: "🕸️" },
  ],
  STUDENT: [
    { href: "/student/plans", label: "My Plans", icon: "🗂️" },
    { href: "/student/insights", label: "Progress Report", icon: "🌟" },
    { href: "/student/skills", label: "My Skills", icon: "🧩" },
    { href: "/student/family", label: "Family Report", icon: "👪" },
    { href: "/play", label: "Join Live", icon: "🎮" },
  ],
};

/** Every page a role can find by name: the menu, then the pages that left it (no duplicates). */
export function searchablePagesFor(role: string, opts: NavOpts = {}): NavItem[] {
  const menu = navItemsFor(role, opts);
  const extra = role === "TEACHER" || role === "STUDENT" ? OFF_MENU[role] : role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" ? adminOffMenu() : [];
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
    { href: "/admin", label: "Home", icon: "🏠" },
    { href: ALL_TOOLS_HREF, label: "All Admin Tools", icon: "🧰" },
    ...ADMIN_GROUPS.flatMap((g) => ADMIN_TOOLS.filter((x) => x.menu && x.group === g.key).map((x) => ({ href: x.href, label: x.label, icon: x.icon, group: g.title }))),
  ];
}

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
