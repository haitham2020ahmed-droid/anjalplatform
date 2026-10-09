/**
 * 🔗 Connections: is everything on the platform joined up? One pass over the school's data, following the
 * learning thread from the Curriculum Map to the students:
 *   Curriculum Map places → skills → questions → MAP goal areas (RIT ranges) → Learning Continuum → students →
 *   MAP plans,
 * with a share for every link, the gaps listed (first ones) and where to fix each.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { masterSkills } from "../skills/master";
import { groupPools, GROUPS } from "../map/map-plan";
import { skillRanges } from "../map/skill-plan";
import { continuumIndex, groupOfGoal, skillsFor } from "../map/continuum";

const s = (v: unknown) => String(v ?? "");
export type Health = "GOOD" | "WARN" | "BAD" | "INFO";
export interface Check { id: string; label: string; detail: string; ok: number; total: number; health: Health; fix: { href: string; label: string } | null; gaps: { label: string; href: string | null }[] }
export interface Stage { key: string; title: string; icon: string; summary: string; checks: Check[] }
export interface ConnectionsView { stages: Stage[]; score: number; checkedAt: string }

const healthOf = (ok: number, total: number, good = 0.9, warn = 0.6): Health => (!total ? "INFO" : ok / total >= good ? "GOOD" : ok / total >= warn ? "WARN" : "BAD");
const check = (c: Omit<Check, "health"> & { health?: Health; good?: number; warn?: number }): Check => ({ ...c, health: c.health ?? healthOf(c.ok, c.total, c.good, c.warn) });

export async function connections(repo: Repo, actor: Actor, now = new Date()): Promise<ConnectionsView> {
  assertCan(actor, "reports:read");
  if (actor.role === "TEACHER") assertCan(actor, "settings:school");
  const schoolId = actor.schoolId!;
  const grades = (await repo.findMany("Grade", { schoolId }, { select: ["id", "level", "isActive"] })).filter((g) => g.isActive !== false).sort((a, b) => Number(a.level) - Number(b.level));

  // ---------------------------------------------------------------- 1. Curriculum Map
  const nodes = grades.length ? await repo.findMany("CurriculumMapNode", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "code", "acceptsQuestions", "categoryType", "level", "gradeId"] }) : [];
  const places = nodes.filter((n) => n.acceptsQuestions === true || n.acceptsQuestions === 1);
  const links = places.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: places.map((p) => p.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const linkedQ = links.length ? await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => s(l.questionId)))] }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] }) : [];
  const pub = new Set(linkedQ.map((q) => s(q.id)));
  const filled = new Set(links.filter((l) => pub.has(s(l.questionId))).map((l) => s(l.nodeId)));
  const emptyPlaces = places.filter((p) => !filled.has(s(p.id)));
  const rtrLevels = nodes.filter((n) => /\.RTR\.(BELOW|ON|ABOVE)$/.test(s(n.code)));
  const respond = new Set((await repo.findMany("RespondActivity", { schoolId }, { select: ["code"] })).map((r) => s(r.code)));
  const rtrMissing = rtrLevels.filter((n) => !respond.has(s(n.code)));
  // a part of a plan (a category: its Below + On + Above together) needs 50+ questions for the 20-correct goal
  const perPart = new Map<string, Set<string>>();
  const codeOf = new Map(places.map((p) => [s(p.id), s(p.code)]));
  for (const p of places) { const code = s(p.code); if (/\.RTR(\.|$)/.test(code)) continue; const part = code.replace(/\.(ABOVE|ON|BELOW)$/, ""); if (!perPart.has(part)) perPart.set(part, new Set()); }
  for (const l of links) { if (!pub.has(s(l.questionId))) continue; const code = codeOf.get(s(l.nodeId)); if (!code) continue; const set = perPart.get(code.replace(/\.(ABOVE|ON|BELOW)$/, "")); set?.add(s(l.questionId)); }
  const thin = [...perPart].filter(([, q]) => q.size < 50).sort((a, b) => a[1].size - b[1].size);
  const curriculum: Stage = {
    key: "MAP_PLACES", title: "Curriculum Map", icon: "🧭", summary: `${places.length} places that take questions`,
    checks: [
      check({ id: "places", label: "Places with questions", detail: "Every unit, text set, category and level of the map has published questions to practise.", ok: places.length - emptyPlaces.length, total: places.length, fix: { href: "/admin/curriculum-map", label: "Open the Curriculum Map" }, gaps: emptyPlaces.slice(0, 12).map((p) => ({ label: s(p.code), href: `/admin/curriculum-map/place/${s(p.code)}` })) }),
      check({ id: "part-50", label: "Parts with 50+ questions", detail: "Each part of a plan (all its levels together) has at least 50 questions, so a student can reach 20 correct without seeing the same questions.", ok: perPart.size - thin.length, total: perPart.size, good: 0.9, warn: 0.6, fix: { href: "/admin/questions/import?to=curriculum", label: "Import questions" }, gaps: thin.slice(0, 12).map(([code, q]) => ({ label: `${code} · ${q.size}`, href: `/admin/curriculum-map/place/${[...codeOf.values()].includes(code) ? code : `${code}.ON`}` })) }),
      check({ id: "respond", label: "Respond to Reading pages written", detail: "Each text set's three level pages have their activity.", ok: rtrLevels.length - rtrMissing.length, total: rtrLevels.length, fix: { href: "/admin/curriculum-map/respond", label: "Respond to Reading" }, gaps: rtrMissing.slice(0, 12).map((n) => ({ label: s(n.code), href: "/admin/curriculum-map/respond" })) }),
    ],
  };

  // ---------------------------------------------------------------- 2. Skills
  const skills = await masterSkills(repo, schoolId);
  const noQ = skills.filter((k) => !k.questions), noArea = skills.filter((k) => !k.area), noStd = skills.filter((k) => !k.standards.length);
  const skillStage: Stage = {
    key: "SKILLS", title: "Skills", icon: "🧩", summary: `${skills.length} skills in Grades ${grades.map((g) => g.level).join(", ")}`,
    checks: [
      check({ id: "skill-q", label: "Skills with questions", detail: "A skill without published questions cannot be practised or assigned.", ok: skills.length - noQ.length, total: skills.length, fix: { href: "/admin/bank-gaps", label: "Question bank gaps" }, gaps: noQ.slice(0, 12).map((k) => ({ label: `G${k.grade} · ${k.name}`, href: `/skill/${k.id}` })) }),
      check({ id: "skill-area", label: "Skills linked to a MAP goal area", detail: "MAP plans, the skill plan and the study plans find skills through their goal area.", ok: skills.length - noArea.length, total: skills.length, fix: { href: "/admin/map-links", label: "Bank ↔ MAP links" }, gaps: noArea.slice(0, 12).map((k) => ({ label: `G${k.grade} · ${k.name}`, href: `/skill/${k.id}` })) }),
      check({ id: "skill-std", label: "Skills with a CCSS standard", detail: "Standards join skills to the Learning Continuum and the standards reports.", ok: skills.length - noStd.length, total: skills.length, fix: { href: "/admin/curriculum/standards", label: "Standards" }, gaps: noStd.slice(0, 12).map((k) => ({ label: `G${k.grade} · ${k.name}`, href: `/skill/${k.id}` })) }),
    ],
  };

  // ---------------------------------------------------------------- 3. Questions
  const skillIds = skills.map((k) => k.id);
  const qs = skillIds.length ? await repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "standardId", "typeId", "difficultyLevel"] }) : [];
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false).map((t) => s(t.id)));
  const skillStd = new Set(skills.filter((k) => k.standards.length).map((k) => k.id));
  const withStd = qs.filter((q) => q.standardId || skillStd.has(s(q.skillId))).length;
  const allLinks = qs.length ? await repo.findMany("QuestionMapLink", { questionId: { in: qs.map((q) => q.id) } }, { select: ["questionId"] }) : [];
  const onMap = new Set(allLinks.map((l) => s(l.questionId)));
  const questionStage: Stage = {
    key: "QUESTIONS", title: "Questions", icon: "❓", summary: `${qs.length} published`,
    checks: [
      check({ id: "q-std", label: "Questions with a standard", detail: "Their own standard or their skill's.", ok: withStd, total: qs.length, fix: { href: "/admin/question-review", label: "Tags & review" }, gaps: [] }),
      check({ id: "q-auto", label: "Questions the platform marks itself", detail: "Short answers need a teacher; they never enter adaptive sets.", ok: qs.filter((q) => !manual.has(s(q.typeId))).length, total: qs.length, good: 0.8, warn: 0.5, fix: null, gaps: [] }),
      check({ id: "q-map", label: "Questions placed on the Curriculum Map", detail: "Placed questions appear under their unit, text set and level; the others are practised by skill.", ok: onMap.size, total: qs.length, health: "INFO", fix: { href: "/admin/questions/unclassified", label: "Classify questions" }, gaps: [] }),
    ],
  };

  // ---------------------------------------------------------------- 4. MAP goal areas × RIT ranges
  const coverage: Check[] = [];
  for (const g of grades) {
    const lvl = Number(g.level);
    const [pk, ranges] = await Promise.all([groupPools(repo, schoolId, lvl), skillRanges(repo, lvl)]);
    const cells: { label: string; n: number }[] = [];
    for (const grp of GROUPS) for (const r of ranges) cells.push({ label: `${grp.name} · RIT ${r.label}`, n: (pk.pools.get(grp.key) ?? []).filter((q) => q.rit >= r.low - 5 && q.rit <= r.high + 5).length });
    const thin = cells.filter((c) => c.n < 8);
    coverage.push(check({ id: `cov-${lvl}`, label: `Grade ${lvl}: goal area × RIT range with 8+ questions`, detail: "Each MAP goal area needs questions at every RIT range (± 5) so plans and adaptive sets can match each student.", ok: cells.length - thin.length, total: cells.length, good: 0.85, warn: 0.6, fix: { href: `/teacher/map-skill-plan?classId=none&grade=${lvl}`, label: "MAP Skill Plan" }, gaps: thin.slice(0, 10).map((c) => ({ label: `${c.label}: ${c.n}`, href: null })) }));
  }
  const mapStage: Stage = { key: "MAP", title: "MAP goal areas", icon: "🗺️", summary: "6 goal areas × 6 RIT ranges per grade", checks: coverage };

  // ---------------------------------------------------------------- 5. Learning Continuum
  const statements = await repo.findMany("LearningStatement", {}, { select: ["subject", "goalArea", "standards", "statement", "topic", "ritLow"] });
  const contChecks: Check[] = [];
  if (!statements.length) contChecks.push(check({ id: "cont", label: "Learning Continuum imported", detail: "Study plans and group plans use it for “ready to learn”.", ok: 0, total: 1, health: "BAD", fix: { href: "/admin/map-continuum", label: "Import the continuum" }, gaps: [] }));
  for (const g of statements.length ? grades : []) {
    const lvl = Number(g.level);
    for (const subject of ["READING", "LANGUAGE"] as const) {
      const ix = await continuumIndex(repo, schoolId, lvl, subject);
      // the bands a student of this grade is likely in (grade norm ± 30 RIT)
      const mine = ix.rows.filter((r) => Number(r.ritLow) >= 160 + (lvl - 4) * 8 && Number(r.ritLow) <= 230 + (lvl - 4) * 8);
      const unlinked = mine.filter((r) => !skillsFor(ix, s(r.standards).split(/\s+/).filter(Boolean), groupOfGoal(s(r.goalArea))).length);
      contChecks.push(check({ id: `cont-${lvl}-${subject}`, label: `Grade ${lvl} ${subject === "READING" ? "Reading" : "Language Usage"}: statements with a platform skill`, detail: "The statements of the bands this grade's students are in, linked to a skill through their CCSS codes.", ok: mine.length - unlinked.length, total: mine.length, good: 0.75, warn: 0.5, fix: { href: "/admin/map-continuum", label: "Learning Continuum" }, gaps: unlinked.slice(0, 8).map((r) => ({ label: `RIT ${r.ritLow}+ · ${s(r.statement)} (${s(r.standards)})`, href: null })) }));
    }
  }
  const contStage: Stage = { key: "CONTINUUM", title: "Learning Continuum", icon: "📘", summary: statements.length ? `${statements.length} statements` : "not imported", checks: contChecks };

  // ---------------------------------------------------------------- 6. People
  const [students, users, classes, members, cts, teachers, parents] = await Promise.all([
    repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id", "userId", "gradeId"] }),
    repo.findMany("User", { schoolId, role: "STUDENT" }, { select: ["id", "displayName", "isActive", "deletedAt"] }),
    repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "academicYearId"] }),
    repo.findMany("ClassMembership", { leftAt: null }, { select: ["classId", "studentId"] }),
    repo.findMany("ClassTeacher", {}, { select: ["classId", "teacherId"] }),
    repo.findMany("Teacher", { schoolId }, { select: ["id", "userId"] }),
    repo.findMany("ParentStudent", {}, { select: ["studentId"] }),
  ]);
  const activeUsers = new Set(users.filter((u) => !u.deletedAt && u.isActive !== false && u.isActive !== 0).map((u) => s(u.id)));
  const live = students.filter((st) => activeUsers.has(s(st.userId)));
  const liveIds = new Set(live.map((x) => s(x.id)));
  const year = (await repo.findMany("AcademicYear", { schoolId })).find((y) => y.isCurrent);
  const liveClasses = classes.filter((c) => !year || c.academicYearId === year.id);
  const inClass = new Set(members.filter((m) => liveIds.has(s(m.studentId))).map((m) => s(m.studentId)));
  const classIds = new Set(liveClasses.map((c) => s(c.id)));
  const taught = new Set(cts.filter((c) => classIds.has(s(c.classId))).map((c) => s(c.classId)));
  const teacherIds = new Set(teachers.map((t) => s(t.id)));
  const teaching = new Set(cts.filter((c) => teacherIds.has(s(c.teacherId)) && classIds.has(s(c.classId))).map((c) => s(c.teacherId)));
  const nameOf = (st: Row) => s(users.find((u) => u.id === st.userId)?.displayName) || "Student";
  const ids = [...liveIds];
  const [mapRows, attempts, plans] = await Promise.all([
    ids.length ? repo.findMany("MapResult", { studentId: { in: ids } }, { select: ["studentId", "subject", "goalName"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, { select: ["studentId"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("MapPlan", { studentId: { in: ids } }, { select: ["studentId", "status", "subject"] }) : Promise.resolve([] as Row[]),
  ]);
  const withRead = new Set(mapRows.filter((r) => /read/i.test(s(r.subject)) && !r.goalName).map((r) => s(r.studentId)));
  const withLang = new Set(mapRows.filter((r) => /lang/i.test(s(r.subject)) && !r.goalName).map((r) => s(r.studentId)));
  const activeNow = new Set(attempts.map((a) => s(a.studentId)));
  const withParent = new Set(parents.map((p) => s(p.studentId)));
  const people: Stage = {
    key: "PEOPLE", title: "Students & classes", icon: "👥", summary: `${live.length} students · ${liveClasses.length} classes · ${teachers.length} teachers`,
    checks: [
      check({ id: "st-class", label: "Students in a class", detail: "A student without a class gets no work and no plans.", ok: inClass.size, total: live.length, good: 0.98, warn: 0.9, fix: { href: "/admin/users?role=STUDENT", label: "Users" }, gaps: live.filter((st) => !inClass.has(s(st.id))).slice(0, 12).map((st) => ({ label: nameOf(st), href: `/admin/student-file/${s(st.id)}` })) }),
      check({ id: "cl-teacher", label: "Classes with a teacher", detail: "Work and plans are sent by the class's teacher.", ok: taught.size, total: liveClasses.length, good: 1, warn: 0.8, fix: { href: "/admin/users?role=TEACHER", label: "Teachers" }, gaps: liveClasses.filter((c) => !taught.has(s(c.id))).map((c) => ({ label: `Class ${s(c.name)}`, href: `/teacher/classes/${s(c.id)}` })) }),
      check({ id: "t-class", label: "Teachers with a class", detail: "", ok: teaching.size, total: teachers.length, good: 0.9, warn: 0.6, fix: { href: "/admin/users?role=TEACHER", label: "Teachers" }, gaps: [] }),
      check({ id: "st-read", label: "Students with a Reading MAP score", detail: "Needed for plans, groups and reports.", ok: live.filter((x) => withRead.has(s(x.id))).length, total: live.length, fix: { href: "/teacher/map-rit", label: "MAP Data" }, gaps: live.filter((x) => !withRead.has(s(x.id))).slice(0, 12).map((st) => ({ label: nameOf(st), href: `/admin/student-file/${s(st.id)}` })) }),
      check({ id: "st-lang", label: "Students with a Language Usage MAP score", detail: "", ok: live.filter((x) => withLang.has(s(x.id))).length, total: live.length, fix: { href: "/teacher/map-rit", label: "MAP Data" }, gaps: live.filter((x) => !withLang.has(s(x.id))).slice(0, 12).map((st) => ({ label: nameOf(st), href: `/admin/student-file/${s(st.id)}` })) }),
      check({ id: "st-active", label: "Students who practised in the last 14 days", detail: "", ok: activeNow.size, total: live.length, good: 0.7, warn: 0.4, fix: { href: "/admin/teachers", label: "Teacher follow-up" }, gaps: [] }),
      check({ id: "st-parent", label: "Students with a parent account", detail: "Parents see shared reports.", ok: live.filter((x) => withParent.has(s(x.id))).length, total: live.length, health: "INFO", fix: { href: "/admin/roster", label: "Import users" }, gaps: [] }),
    ],
  };

  // ---------------------------------------------------------------- 7. Plans
  const scored = new Set([...withRead, ...withLang]);
  const planned = new Set(plans.map((p) => s(p.studentId)));
  const sent = new Set(plans.filter((p) => p.status === "SENT").map((p) => s(p.studentId)));
  const planStage: Stage = {
    key: "PLANS", title: "MAP plans", icon: "📋", summary: `${plans.length} plans`,
    checks: [
      check({ id: "pl-made", label: "Students with MAP scores who have a plan", detail: "Plans are drafted when scores are saved.", ok: [...scored].filter((x) => planned.has(x)).length, total: scored.size, fix: { href: "/teacher/map-plans?tab=plans", label: "MAP Plans" }, gaps: [] }),
      check({ id: "pl-sent", label: "Plans sent to the students", detail: "A draft becomes adaptive sets in the student's work once it is sent.", ok: [...scored].filter((x) => sent.has(x)).length, total: scored.size, good: 0.8, warn: 0.4, fix: { href: "/teacher/map-plans?tab=plans", label: "Send the drafts" }, gaps: [] }),
    ],
  };

  const stages = [curriculum, skillStage, questionStage, mapStage, contStage, people, planStage];
  const scoredChecks = stages.flatMap((x) => x.checks).filter((c) => c.health !== "INFO" && c.total);
  const score = scoredChecks.length ? Math.round((scoredChecks.reduce((t, c) => t + c.ok / c.total, 0) / scoredChecks.length) * 100) : 0;
  return { stages, score, checkedAt: now.toISOString() };
}


/** For the admin home: the same view, kept 10 minutes per school (it reads a lot). */
const cache = new Map<string, { at: number; v: Promise<ConnectionsView> }>();
export function connectionsCached(repo: Repo, actor: Actor): Promise<ConnectionsView> {
  const key = s(actor.schoolId), hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.v;
  const v = connections(repo, actor).catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), v });
  return v;
}
