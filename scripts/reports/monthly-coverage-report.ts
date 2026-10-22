/**
 * 🆕 feature (Oct 2026): Monthly MAP Question-Bank coverage alert.
 *
 * ENGLISH — what this script does:
 *   Once a month, this script checks every school's Question Bank against the MAP coverage report (the same
 *   report an admin sees on /admin/coverage) and finds every platform skill with fewer than ENOUGH_QUESTIONS
 *   (coverage.ts) published questions — i.e. a skill a MAP plan could assign to a student but that doesn't yet
 *   have enough questions behind it. It then sends an in-platform notification (the bell icon) to every
 *   SCHOOL_ADMIN and SUPER_ADMIN user of that school, summarising which skills are low. It does NOT change
 *   anything in the question bank: it only reads question counts (the same mapCoverage() function already used
 *   by the live /admin/coverage page) and creates notifications.
 *
 *   This script is NOT meant to be run by hand from a terminal. It is meant to run automatically, once a
 *   month, as a Render Cron Job (see the exact setup steps below). Running it twice in the same month is safe:
 *   it will simply send the same alert again (a second notification) — it never deletes or edits anything, so
 *   there is no way for it to damage data.
 *
 *   Render Cron Job setup (do this once, in the Render dashboard):
 *     1. Go to the Render dashboard → click "New" → choose "Cron Job".
 *     2. Connect it to the SAME GitHub repo this platform already deploys from.
 *     3. Build Command: the exact same Build Command the main web service already uses (e.g. "npm install &&
 *        npm run build" — whatever is already set on the main service's Settings page; copy it exactly so this
 *        job has the same compiled code and the same DATABASE_URL environment variable available to it).
 *     4. Start Command: npx tsx scripts/reports/monthly-coverage-report.ts
 *     5. Schedule: 0 0 1 * *
 *        This is a "cron expression" with 5 parts — minute hour day-of-month month day-of-week — read left to
 *        right: minute 0, hour 0 (midnight), day-of-month 1 (the 1st), every month ("*"), every day-of-week
 *        ("*"). In plain words: "run at 00:00 (midnight) on the 1st day of every month." You do not need to
 *        change this unless you want a different day/time.
 *     6. Make sure the same environment variables as the main web service are set on this Cron Job too
 *        (DATABASE_URL at minimum) — Render usually lets you copy them from an existing service.
 *     7. Save. Render will now run this script automatically once a month; nothing else to do.
 *
 * ARABIC — بالعربي ماذا يفعل هذا السكربت:
 *   هذا السكربت يعمل تلقائيًا مرة واحدة كل شهر، ويفحص "بنك الأسئلة" في كل مدرسة على المنصة، ويبحث عن كل مهارة
 *   (skill) تستخدمها خطط MAP وعدد أسئلتها المنشورة أقل من الحد الأدنى (ENOUGH_QUESTIONS، وهو نفس الفحص الموجود
 *   في صفحة /admin/coverage). ثم يرسل "إشعارًا داخل المنصة" (أيقونة الجرس) لكل حساب مدير مدرسة (SCHOOL_ADMIN)
 *   أو مدير عام (SUPER_ADMIN) في تلك المدرسة، يلخّص فيه المهارات التي تحتاج إلى مزيد من الأسئلة. السكربت لا
 *   يغيّر أي شيء في بنك الأسئلة أبدًا — فقط يقرأ عدد الأسئلة وينشئ إشعارات جديدة.
 *
 *   هذا السكربت لا يُشغَّل يدويًا من الطرفية (Terminal). هو مُعدّ ليعمل تلقائيًا مرة في الشهر عبر خدمة
 *   "Render Cron Job". تشغيله مرتين في نفس الشهر أمر آمن تمامًا: سيرسل التنبيه نفسه مرة أخرى فقط، ولن يحذف أو
 *   يُعدّل أي بيانات موجودة.
 *
 *   خطوات إعداد Render Cron Job (مرة واحدة فقط):
 *     ١. من لوحة تحكم Render اضغط "New" ثم اختر "Cron Job".
 *     ٢. اربطه بنفس مستودع GitHub (repo) الذي تُنشر منه المنصة حاليًا.
 *     ٣. أمر البناء (Build Command): نفس أمر البناء المستخدم في الخدمة الرئيسية بالضبط (انسخه من إعدادات
 *        الخدمة الرئيسية حتى تتوفر له نفس متغيرات البيئة مثل DATABASE_URL).
 *     ٤. أمر التشغيل (Start Command): npx tsx scripts/reports/monthly-coverage-report.ts
 *     ٥. الجدولة (Schedule): 0 0 1 * *
 *        هذا يعني: الدقيقة 0، الساعة 0 (منتصف الليل)، يوم 1 من الشهر، كل شهر، كل يوم من أيام الأسبوع — أي
 *        "تشغيل عند منتصف الليل في اليوم الأول من كل شهر." لا حاجة لتغييره إلا إذا رغبت بوقت مختلف.
 *     ٦. تأكد من نسخ نفس متغيرات البيئة الموجودة في الخدمة الرئيسية (على الأقل DATABASE_URL) إلى هذه الوظيفة.
 *     ٧. احفظ، وستعمل Render تلقائيًا بعد ذلك من دون أي تدخل إضافي.
 *
 * Safety: read-only against question counts; the only writes this script makes are new Notification rows
 * (repo.createMany) — no update, no delete, nothing destructive. Safe to re-run any time.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import type { Repo, Row } from "../../src/server/seeding/repo";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { mapCoverage, ENOUGH_QUESTIONS, type CoverageRow } from "../../src/server/map/coverage";

const s = (v: unknown) => String(v ?? "");

/** One line per low-coverage skill, e.g. "Concept Vocabulary (Grade 4, Reading, 12 questions)". */
function lineFor(r: CoverageRow): string {
  const zero = r.questions <= 0;
  return `${zero ? "🔴" : "🟠"} ${r.skill} (Grade ${r.grade}, ${r.subject}, ${r.questions} question${r.questions === 1 ? "" : "s"})`;
}

/** Builds the plain-text body for one school's report. Empty string if nothing is below the threshold. */
function reportBody(schoolName: string, low: CoverageRow[]): string {
  if (!low.length) return "";
  const lines = low
    .sort((a, b) => a.questions - b.questions || a.subject.localeCompare(b.subject) || a.grade - b.grade || a.skill.localeCompare(b.skill))
    .map(lineFor);
  return [
    `⚠️ ${low.length} skill${low.length === 1 ? "" : "s"} below the question threshold (${ENOUGH_QUESTIONS}+) at ${schoolName}:`,
    ...lines,
    "",
    "Open Admin → Question Bank Coverage (/admin/coverage) to see the full report and add questions.",
  ].join("\n");
}

async function main() {
  const prisma = new PrismaClient();
  const repo: Repo = new PrismaRepo(prisma, { transactions: "none" });
  const now = new Date();

  console.log(`[monthly-coverage-report] starting at ${now.toISOString()}`);

  const schools = await repo.findMany("School", { deletedAt: null }, { select: ["id", "name"] });
  if (!schools.length) { console.log("No schools found — nothing to do."); await prisma.$disconnect(); return; }

  let totalNotified = 0;
  for (const school of schools as Row[]) {
    const schoolId = s(school.id), schoolName = s(school.name) || "your school";
    try {
      // one admin actor is enough to call mapCoverage (it only needs role + schoolId, not a specific person)
      const adminUser = (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true, deletedAt: null }))[0]
        ?? (await repo.findMany("User", { schoolId, role: "SUPER_ADMIN", isActive: true, deletedAt: null }))[0];
      if (!adminUser) { console.log(`  ${schoolName}: no active admin account to run the report as — skipped.`); continue; }
      const actor: Actor = await resolveActor(repo, adminUser);

      const report = await mapCoverage(repo, actor);
      const low = report.rows.filter((r) => r.tone === "RED" || r.tone === "ORANGE");
      if (!low.length) { console.log(`  ${schoolName}: every linked skill has ${ENOUGH_QUESTIONS}+ questions — nothing to send.`); continue; }

      const body = reportBody(schoolName, low);
      console.log(`  ${schoolName}: ${low.length} skill(s) below ${ENOUGH_QUESTIONS} questions.`);

      // every SCHOOL_ADMIN/SUPER_ADMIN of this school gets the same in-app alert (the guaranteed-to-work channel)
      const admins = await repo.findMany("User", { schoolId, role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }, isActive: true, deletedAt: null }, { select: ["id"] });
      if (!admins.length) { console.log(`  ${schoolName}: no admin users to notify — skipped.`); continue; }
      await repo.createMany("Notification", admins.map((u) => ({
        userId: s(u.id), type: "ADMIN_MESSAGE",
        title: `⚠️ ${low.length} MAP skill${low.length === 1 ? "" : "s"} need more questions`,
        body, link: "/admin/coverage", readAt: null, createdAt: now,
      })));
      totalNotified += admins.length;
      console.log(`  ${schoolName}: notified ${admins.length} admin(s).`);
    } catch (e) {
      // one school's failure (e.g. no continuum, a schema hiccup) must never stop the rest of the schools
      console.warn(`  ${schoolName}: ⚠️ skipped after an error: ${(e as Error).message}`);
    }
  }

  console.log(`[monthly-coverage-report] done. ${totalNotified} notification(s) created across ${schools.length} school(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("[monthly-coverage-report] FAILED:", (e as Error).message); process.exit(1); });
