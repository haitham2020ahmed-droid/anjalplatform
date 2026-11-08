/**
 * The first-login tour's steps — a plain module (no "use client"), so a server page can ask whether a role has a tour.
 * 🩹 platform audit (8 Nov 2026, live error log): /guide called tourStepsFor() from the client file on the server and
 * the whole Guide page failed ("Attempted to call tourStepsFor() from the server").
 */
export interface TourStep { target: string; icon: string; title: string; text: string }

/** 3–4 short tips per role, pointing at the main buttons (elements with a matching data-tour attribute). */
export const TOUR_STEPS: Record<string, TourStep[]> = {
  STUDENT: [
    { target: "my-work", icon: "📘", title: "My Work", text: "Everything your teacher gives you is in My Work. Tap Start on the first row." },
    { target: "plans", icon: "🗺️", title: "MAP", text: "Your MAP scores, your goal and your MAP practice." },
    { target: "tests", icon: "📝", title: "My Tests", text: "Tests to do and tests you finished are in My Tests." },
    { target: "lang", icon: "🌐", title: "Language", text: "Parents: tap the language button at the top to read the menus in Arabic. Lessons and questions stay in English." },
  ],
  TEACHER: [
    { target: "students", icon: "👥", title: "My Classes", text: "Your classes, student lists, accounts and each student’s page are in My Classes." },
    { target: "plans", icon: "🗂️", title: "Plans", text: "Every plan is in Plans: MAP, NAFS, Curriculum, Support, Test and your own." },
    { target: "teacher-reports", icon: "📊", title: "Reports", text: "Every report about your students is in Reports." },
    { target: "home", icon: "🏠", title: "Your home page", text: "Tap Home at the top of any page to come back here. You can never get lost." },
  ],
  ADMIN: [
    { target: "content", icon: "📚", title: "Content", text: "Questions, Curriculum Map, Grammar and ReadMaster are under Content." },
    { target: "reports", icon: "📊", title: "Reports", text: "Department Week, reports to approve and the school reports are under Reports." },
    { target: "all-tools", icon: "🧰", title: "All Admin Tools", text: "Every admin page is in All Admin Tools: type a word to find it." },
    { target: "home", icon: "🏠", title: "Your home page", text: "Tap Home at the top of any page to come back here. You can never get lost." },
  ],
};
export const tourStepsFor = (role: string): TourStep[] => TOUR_STEPS[role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" ? "ADMIN" : role] ?? [];

