/** 👪 A plain monthly summary for a parent: levels, practice, accuracy, the MAP goal, and one thing to do at home. */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { studentLearningPath } from "./learning-path";

const s = (v: unknown) => String(v ?? "");
export interface ParentSummary {
  categories: { name: string; level: string }[]; overall: string | null;
  answers30: number; accuracy30: number | null; rapidPct30: number | null;
  map: { rit: number; goal: number | null; term: string } | null;
  tip: { en: string; ar: string };
}

export async function parentSummary(repo: Repo, actor: Actor, studentId: string): Promise<ParentSummary> {
  const p = await studentLearningPath(repo, actor, studentId);   // access checked inside (a parent sees only their children)
  const reading = (await repo.findMany("MapResult", { studentId })).filter((r) => !r.goalName && /read/i.test(s(r.subject)))
    .sort((a, b) => s(b.testDate instanceof Date ? b.testDate.toISOString() : b.testDate).localeCompare(s(a.testDate instanceof Date ? a.testDate.toISOString() : a.testDate)))[0];
  const map = reading ? { rit: Number(reading.rit), goal: reading.projectedGrowth !== null && reading.projectedGrowth !== undefined ? Number(reading.rit) + Number(reading.projectedGrowth) : null, term: s(reading.termName) } : null;
  const tip = p.answers30 < 20
    ? { en: "Practice a little every day: 10 minutes on the platform builds the habit.", ar: "التدريب قليلًا كل يوم: عشر دقائق على المنصة تبني العادة." }
    : p.rapidPct30 !== null && p.rapidPct30 >= 30
      ? { en: "Encourage your child to read each question fully before answering: speed lowers the results.", ar: "شجّعوا طفلكم على قراءة السؤال كاملًا قبل الإجابة: السرعة تخفض النتائج." }
      : p.accuracy30 !== null && p.accuracy30 < 60
        ? { en: "Read together for 15 minutes and ask: what is the main idea? why did it happen?", ar: "اقرؤوا معًا ربع ساعة واسألوا: ما الفكرة الرئيسية؟ ولماذا حدث ذلك؟" }
        : { en: "Great progress: let your child choose a longer book or ReadMaster article this week.", ar: "تقدّم رائع: دعوا طفلكم يختار كتابًا أطول أو مقالًا من ReadMaster هذا الأسبوع." };
  return { categories: p.categories.map((c) => ({ name: c.name, level: c.level })), overall: p.level?.level ?? null, answers30: p.answers30, accuracy30: p.accuracy30, rapidPct30: p.rapidPct30, map, tip };
}
