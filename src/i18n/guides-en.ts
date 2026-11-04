/**
 * Role guides (/guide) in ENGLISH — the default, matching the rest of the interface. One simple page per role with
 * numbered steps of the new menus. The Arabic version (for a parent or anyone who prefers it) lives in guides-ar.ts;
 * the page offers an "Arabic / العربية" switch for it (feature, Oct 2026 — the guide used to be Arabic-only).
 * Keep this file's structure (role keys, step count and order, hrefs) in sync with guides-ar.ts.
 */
export type { Step, Guide } from "./guides-ar";
import type { Guide } from "./guides-ar";

export const GUIDES_EN: Record<"STUDENT" | "TEACHER" | "SCHOOL_ADMIN", Guide> = {
  STUDENT: {
    title: "Student Guide",
    intro: "The menu got shorter and simpler. These steps say where to find everything.",
    ask: "Have a question? Ask your teacher.",
    steps: [
      { title: "Start from “My Work”", where: "First button in the menu", text: "Everything your teacher sent you is here. Tap “Start” on the first task. Red numbers mean a task is late or due today.", href: "/student" },
      { title: "Programs: MAP and the Curriculum Map", where: "“Programs” group", text: "Your MAP results and plan, and your grade's Curriculum Map. RTI and NAFS appear here only if they apply to you.", href: "/student/map" },
      { title: "Reading", where: "“Reading” group", text: "ReadMaster, ReadRise and Fluency Coach. Read at your level or above. Double-tap any word to see its meaning.", href: "/student/readmaster" },
      { title: "My Achievements", where: "“Achievements” group", text: "My Tests, My Certificates and Badges.", href: "/student/tests" },
      { title: "My Reports", where: "“My Reports” button", text: "All your reports in one place: your progress, your tests and the family report.", href: "/student/reports" },
      { title: "More", where: "“More” group (folded)", text: "Tap “More” to open it: My Lessons, Respond to Reading, My Words, Writing, and Help.", href: "/student/second-chance" },
      { title: "Live games", where: "Home page button", text: "To join a live challenge, use “Join Live” on your home page and type the code your teacher gives.", href: "/student" },
    ],
  },
  TEACHER: {
    title: "Teacher Guide",
    intro: "The menu is now short: eight groups, with the less-used pages under “More”. Here is where things are now.",
    ask: "Have a question? Ask your Language Arts department head. To send feedback, use the “Feedback” button at the top.",
    steps: [
      { title: "Home: your class today", where: "“Home”", text: "Three big numbers: who worked today, who needs help, who hasn't started. Tap any number to see the names. It also has “Find a skill and assign it”.", href: "/teacher" },
      { title: "My Students", where: "“My Students”", text: "Every student of yours, ready and grouped by class. Type one letter of the name (Arabic or English) or the student number. Tap a name to open their page. “Find a student” and “My Classes” now live here.", href: "/teacher/students" },
      { title: "Programs", where: "“Programs” group", text: "MAP (scores and plans inside the MAP page), Curriculum Map, RTI, and Plans. Old assignments are inside “Plans”.", href: "/teacher/map-center" },
      { title: "Tests and Live Challenge", where: "“Assessments” and “Live Challenge”", text: "Build a test from skills and assign it. Or run a live challenge for the whole class.", href: "/teacher/assessments" },
      { title: "Reports", where: "“Reports”", text: "Three steps: choose the report → choose the class, student or group and the period → preview, then “Download PDF” or “Send to parents”. Family reports and student progress live here now.", href: "/teacher/reports" },
      { title: "My Week", where: "“My Week”", text: "Each day's plan, what's due this week, who hasn't started, and live challenges. One button: “Plan next week”.", href: "/teacher/week" },
      { title: "More", where: "“More” group (folded)", text: "Levels and groups, the Data Meeting, the Diagnostic Test, Fluency, ReadRise, worksheets, Writing, the dictionary, grammar, the calendar, and Help.", href: "/teacher/tiers" },
    ],
  },
  SCHOOL_ADMIN: {
    title: "Admin Guide",
    intro: "The admin menu is now five sections, with the rest under “More” and in “All Admin Tools”.",
    ask: "You'll find every admin page in “All Admin Tools”: type a word to search.",
    steps: [
      { title: "School", where: "“School” section", text: "The school page, Users, finding a student, and following up with teachers.", href: "/admin/users" },
      { title: "Content", where: "“Content” section", text: "The question bank, “Sort Questions” to review question-to-skill links, ReadRise, ReadMaster, the Curriculum Map, grammar, and the dictionary.", href: "/admin/questions" },
      { title: "Assessments & Programs", where: "“Assessments & Programs” section", text: "Teacher tests, MAP, the NAFS link, levels (Below / On / Above) and support levels, and the weekly RTI plan.", href: "/teacher/map-center" },
      { title: "Reports", where: "“Reports” section", text: "Analytics, the end-of-term report, reports waiting for approval, and the report center.", href: "/admin/report-approvals" },
      { title: "Settings", where: "“Settings” section", text: "Settings, AI tools, backup, data health, data cleanup, and Feedback.", href: "/admin/settings" },
      { title: "More and All Tools", where: "“More” and “All Admin Tools”", text: "Every other page still works. Open “All Admin Tools” and type a word like MAP or backup.", href: "/admin/all" },
    ],
  },
};

export const ROLE_LABEL_EN: Record<keyof typeof GUIDES_EN, string> = { SCHOOL_ADMIN: "Admin", TEACHER: "Teacher", STUDENT: "Student" };

/** The few fixed words of the guide page, English. */
export const GUIDE_UI_EN = { guides: "Guides", privacy: "Privacy" };
