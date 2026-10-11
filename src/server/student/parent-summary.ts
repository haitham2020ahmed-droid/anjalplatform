/** 👪 A plain monthly summary for a parent: levels, practice, accuracy, the MAP goal, and one thing to do at home. */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { studentLearningPath } from "./learning-path";
import { mapSummaries } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
export interface ParentSummary {
  categories: { name: string; level: string }[]; overall: string | null;
  answers30: number; accuracy30: number | null; rapidPct30: number | null;
  map: { rit: number; goal: number | null; term: string } | null;
  tip: { en: string; ar: string };
}

export async function parentSummary(repo: Repo, actor: Actor, studentId: string): Promise<ParentSummary> {
  const p = await studentLearningPath(repo, actor, studentId);   // access checked inside (a parent sees only their children)
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  // the MAP goal the teacher sees: Fall RIT + Fall projected growth (not "latest RIT + its own growth")
  const [summary, profile] = await Promise.all([
    mapSummaries(repo, [studentId], "READING", new Map([[studentId, grade]])).then((m) => m.get(studentId)),
    repo.findUnique("StudentProfile", { studentId }),
  ]);
  const map = summary?.latest ? { rit: summary.latest.rit, goal: summary.springTarget, term: summary.latest.term } : null;
  // the level the school shows elsewhere: the student profile's (MAP / weekly check / diagnostic), else the learning path's
  const profileLevel = profile && ["BELOW", "ON", "ABOVE"].includes(s(profile.level)) ? s(profile.level) : null;
  const tip = p.answers30 < 20
    ? { en: "Practice a little every day: 10 minutes on the platform builds the habit.", ar: "التدريب قليلًا كل يوم: عشر دقائق على المنصة تبني العادة." }
    : p.rapidPct30 !== null && p.rapidPct30 >= 30
      ? { en: "Encourage your child to read each question fully before answering: speed lowers the results.", ar: "شجّعوا طفلكم على قراءة السؤال كاملًا قبل الإجابة: السرعة تخفض النتائج." }
      : p.accuracy30 !== null && p.accuracy30 < 60
        ? { en: "Read together for 15 minutes and ask: what is the main idea? why did it happen?", ar: "اقرؤوا معًا ربع ساعة واسألوا: ما الفكرة الرئيسية؟ ولماذا حدث ذلك؟" }
        : { en: "Great progress: let your child choose a longer book or ReadMaster article this week.", ar: "تقدّم رائع: دعوا طفلكم يختار كتابًا أطول أو مقالًا من ReadMaster هذا الأسبوع." };
  return { categories: p.categories.map((c) => ({ name: c.name, level: c.level })), overall: profileLevel ?? p.level?.level ?? null, answers30: p.answers30, accuracy30: p.accuracy30, rapidPct30: p.rapidPct30, map, tip };
}
