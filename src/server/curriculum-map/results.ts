/** Class results on the Curriculum Map: answers and % correct per place (unit → text set → category → level). */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { attachmentNodes } from "./questions";

const s = (v: unknown) => String(v ?? "");
export interface PlaceResult { code: string; label: string; answered: number; correct: number; pct: number | null; students: number }
export interface CurriculumResults {
  className: string; grade: number; answered: number; pct: number | null;
  units: { title: string; sets: { heading: string; places: PlaceResult[] }[] }[];
  weakest: PlaceResult[];
}

export async function curriculumResults(repo: Repo, actor: Actor, classId: string): Promise<CurriculumResults> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const nodes = (await attachmentNodes(repo, actor.schoolId!)).filter((n) => n.grade === grade);
  const students = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }) : [];
  const nodeOfQuestion = new Map(links.map((l) => [s(l.questionId), s(l.nodeId)]));
  const attempts = links.length && students.length
    ? await repo.findMany("QuestionAttempt", { questionId: { in: [...nodeOfQuestion.keys()] }, studentId: { in: students } }, { select: ["questionId", "studentId", "isCorrect"] })
    : [];
  const agg = new Map<string, { n: number; ok: number; who: Set<string> }>();
  for (const a of attempts) {
    const node = nodeOfQuestion.get(s(a.questionId))!;
    const g = agg.get(node) ?? { n: 0, ok: 0, who: new Set<string>() };
    g.n++; if (a.isCorrect) g.ok++; g.who.add(s(a.studentId)); agg.set(node, g);
  }
  const LV = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" } as const;
  const resultOf = (n: (typeof nodes)[number]): PlaceResult => {
    const g = agg.get(n.id);
    return { code: n.code, label: `${n.categoryLabel.replace(/^\d+-\s*/, "")}${n.level ? ` · ${LV[n.level]}` : ""}`, answered: g?.n ?? 0, correct: g?.ok ?? 0, pct: g ? Math.round((100 * g.ok) / g.n) : null, students: g?.who.size ?? 0 };
  };
  const units: CurriculumResults["units"] = [];
  for (const n of nodes) {
    let u = units.find((x) => x.title === n.unitTitle); if (!u) { u = { title: n.unitTitle, sets: [] }; units.push(u); }
    let st = u.sets.find((x) => x.heading === n.heading); if (!st) { st = { heading: n.heading, places: [] }; u.sets.push(st); }
    st.places.push(resultOf(n));
  }
  const all = nodes.map(resultOf);
  const answered = all.reduce((t, r) => t + r.answered, 0), correct = all.reduce((t, r) => t + r.correct, 0);
  return {
    className: s(klass.name), grade, answered, pct: answered ? Math.round((100 * correct) / answered) : null, units,
    weakest: all.filter((r) => r.answered >= 3).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 8),
  };
}
