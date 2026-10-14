/**
 * ⚡ Responsiveness on every page: heavy sections show a page-shaped skeleton the moment a link is clicked, pages read
 * independent data side by side, the teacher home never waits for the daily job / alert scan, the frame's NAFS flag
 * is kept for a minute, staff-only Curriculum Map buttons are not in the students' bundle, the ReadRise growth story
 * streams in, and the school ReadRise dashboard reads only the columns it shows.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { canSeeNafs, canSeeNafsCached } from "../src/server/teacher/nafs-access";
import { schoolDashboard } from "../src/server/readrise/dashboards";
import { MeasuringRepo } from "../scripts/perf/measuring-repo";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const LOADING = [
  "student/reports", "student/work", "student/skills", "student/curriculum", "student/insights", "student/plans", "student/map",
  "student/tests", "student/writing", "student/reading", "student/nafs", "student/badges", "student/avatar",
  "teacher/readrise", "teacher/readrise/library", "teacher/reports", "teacher/growth", "teacher/progress", "teacher/map-reports",
  "teacher/data-meeting", "teacher/students", "teacher/assignments", "teacher/assessments", "teacher/curriculum",
  "admin/readrise", "admin/readrise/dashboard", "admin/analytics", "admin/question-bank", "admin/performance", "admin/coverage", "admin/term-report",
];

describe("responsiveness", () => {
  test("heavy sections have their own loading skeleton (only a default export, simple neutral blocks)", () => {
    for (const r of LOADING) {
      const f = `src/app/${r}/loading.tsx`;
      assert.ok(existsSync(join(ROOT, f)), f);
      const src = read(f);
      assert.match(src, /export default function Loading\(\)/, f);
      assert.equal((src.match(/\bexport\b/g) ?? []).length, 1, `${f}: page files export only Next fields`);
    }
    const sk = read("src/components/loading-skeletons.tsx");
    assert.match(sk, /export function SectionSkeleton/);
    assert.match(sk, /export function ReportSkeleton/);
    assert.match(read("src/components/loading-status.tsx"), /role="status"/);
    // the screen-reader line of every skeleton is translated
    for (const l of [...new Set([...LOADING.map((r) => read(`src/app/${r}/loading.tsx`)), sk].flatMap((s) => [...s.matchAll(/label(?:\s*=\s*|:\s*\w+\s*=\s*)"(Loading[^"]*)"/g)].map((m) => m[1])))]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(l), `UI string: ${l}`);
      assert.ok(ar[l as keyof typeof ar] && ar[l as keyof typeof ar] !== l, `Arabic: ${l}`);
    }
  });

  test("teacher home: the daily job and alert scan run after the response; reads side by side", () => {
    const home = read("src/app/teacher/page.tsx");
    assert.ok(!/await maybeRunDaily/.test(home.split("runAfterResponse(")[0]), "daily job not awaited by the page");
    assert.match(home, /runAfterResponse\("teacher\.daily"/);
    assert.ok(!/^\s*if \(actor\.schoolId\) await scanAlerts/m.test(home), "alert scan not awaited by the page");
    // (r67 skill stars: the one-time notice is read side by side too)
    assert.match(home, /const \[\{ t \}, h, sum, toGrade(?:, \w+)*\] = await Promise\.all\(\[\s*getT\(\)/);
    const admin = read("src/app/admin/page.tsx");
    // the admin home streams its sections (Update 57): the follow-up is started at once and read beside the counts
    assert.match(admin, /const follow = teacherFollowupForHome\(repo, actor, now\)/, "admin follow-up started before the sections");
    assert.ok((admin.match(/<Suspense fallback=/g) ?? []).length >= 3, "admin home sections stream in");
  });

  test("teacher ReadRise: the class summary and the open tab load at the same time; no await inside the JSX", () => {
    const p = read("src/app/teacher/readrise/page.tsx");
    assert.match(p, /const \[r, growth, skills, polls, writing, assigned, library\] = await Promise\.all\(\[/);
    assert.ok(!/=\{await /.test(p), "no sequential await in the tabs");
  });

  test("student ReadRise report tab: the growth story streams in behind a light fallback", () => {
    const p = read("src/app/student/readrise/page.tsx");
    assert.match(p, /<Suspense fallback=\{<div aria-hidden="true" className="[^"]*animate-pulse[^"]*" \/>\}>\s*<StoryPanel/);
    assert.ok(!/^export (async )?function StoryPanel/m.test(p), "page files export only Next page fields");
    assert.match(p, /startReadRiseLibraryLoad\(repo\)/);
    assert.ok(!/await ensureReadRiseLibrary/.test(p));
  });

  test("Curriculum Map: staff-only Assign / Send buttons are lazy (never downloaded by students)", () => {
    const c = read("src/components/curriculum-map/lesson-card.tsx");
    assert.match(c, /dynamic\(\(\) => import\("\.\/assign-button"\)/);
    assert.match(c, /dynamic\(\(\) => import\("\.\/send-plan"\)/);
    assert.ok(!/^import \{[^}]*\} from "\.\/(assign-button|send-plan)"/m.test(c), "no static import");
  });

  test("next.config: compression on; logos and icons cached by the browser", () => {
    const cfg = read("next.config.ts");
    assert.match(cfg, /compress: true/);
    assert.match(cfg, /source: "\/brand\/:path\*"/);
    assert.match(cfg, /source: "\/icons\/:path\*"/);
  });

  test("the frame's NAFS flag: same answer, the teacher's answer kept (no reads on the next page)", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
    const m = new MeasuringRepo(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const teacher = await actorFor("demo.teacher.4a");
    const admin = await actorFor("demo.admin");
    const first = await canSeeNafsCached(m, teacher);
    assert.equal(first, await canSeeNafs(repo, teacher));
    const calls = m.stats.calls;
    assert.ok(calls > 0);
    assert.equal(await canSeeNafsCached(m, teacher), first);
    assert.equal(m.stats.calls, calls, "second page: no reads");
    assert.equal(await canSeeNafsCached(m, admin), true, "admins always");
    assert.match(read("src/server/ui/shell-data.ts"), /canSeeNafsCached\(repo, actor\)/, "started with the frame's other data");
  });

  test("school ReadRise dashboard: classes and grades read with only the columns it uses", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const seen: { model: string; select?: readonly string[] }[] = [];
    const spy = new Proxy(repo, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (k === "findMany") return (model: string, w: unknown, o?: { select?: readonly string[] }) => { seen.push({ model, select: o?.select }); return (v as Function).call(t, model, w, o); };
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const d = await schoolDashboard(spy, admin);
    assert.ok(d.classes.length > 0 && d.classes.every((c) => c.name && c.grade > 0), "names and grades still shown");
    assert.deepEqual(seen.find((x) => x.model === "Class")?.select, ["id", "name", "gradeId"]);
    assert.deepEqual(seen.find((x) => x.model === "Grade")?.select, ["id", "level"]);
  });
});
