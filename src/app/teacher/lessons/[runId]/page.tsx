import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { Organizer } from "@/components/lessons/organizer";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { lessonRunDetail } from "@/server/lessons/teacher";

export const metadata = { title: "Lesson run" };

const PHASE: Record<string, string> = { MODEL: "Model", GUIDED: "Guided", INDEPENDENT: "On their own", CHECK: "Quick check", DONE: "Done" };
const APPROACH = ["Standard", "Organizer first", "Easier items + frames"];

/** 🧩 One student's lesson: the organizer they filled in and every step (answers, hints, results). */
export default async function LessonRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { runId } = await params;
  const r = await lessonRunDetail(repo, actor, String(runId).slice(0, 191));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/lessons", label: "Lessons" }} icon="🧩" title={`${r.student} · ${r.skill}`}
        subtitle={`${PHASE[r.phase] ?? r.phase} · approach: ${APPROACH[r.approach] ?? r.approach} · quick-check tries: ${r.attempts}${r.checkPct !== null ? ` · last check ${r.checkPct}%` : ""}${r.passed === true ? " · ✅ passed" : r.passed === false ? " · needs a small-group re-teach" : ""}`} />
      <div className="space-y-6">
        {r.organizerSpec && (
          <Section title="Organizer" icon="🗂️" hint={r.organizer ? (r.organizer.complete ? "Complete." : `Not complete: ${r.organizer.missing.join("; ")}.`) : "Not started."}>
            <Organizer spec={r.organizerSpec} initial={r.organizer} readOnly />
          </Section>
        )}
        <Section title="Steps" icon="🧾">
          <ol className="space-y-1 text-sm">
            {r.steps.map((e, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-2">
                <span className="tabular-nums text-slate-500">{String(e.at).slice(0, 16).replace("T", " ")}</span>{" · "}
                {e.t === "MODEL" ? `Worked example: ${e.correct ? "found the clue sentence" : "missed the clue sentence"}`
                  : e.t === "SET" ? `${PHASE[e.phase]} started (${e.ids.length} questions, approach: ${APPROACH[e.approach] ?? e.approach})`
                  : e.t === "HINT" ? `Hint ${e.level}`
                  : e.t === "ANS" ? `${PHASE[e.phase]}: ${e.correct ? "✓" : "✗"}${e.hints ? ` (${e.hints} hint${e.hints === 1 ? "" : "s"}, ${Math.round(e.credit * 100)}% credit)` : ""} — ${e.stem ?? ""}`
                  : e.t === "RESULT" ? `${PHASE[e.phase]} result: ${e.correct}/${e.total} ${e.passed ? "→ next step" : "→ re-teach"}` : ""}
              </li>
            ))}
          </ol>
        </Section>
        {r.reteach && (
          <Section title="Re-teach ideas" icon="🔁">
            <ul className="list-disc space-y-1 ps-5 text-sm">{r.reteach.map((x) => <li key={x.title}><span className="font-semibold">{x.title}: </span>{x.how}</li>)}</ul>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
