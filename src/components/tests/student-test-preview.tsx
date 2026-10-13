"use client";
/**
 * 👀 A test exactly as the student gets it: the quiz player itself (preview mode — one question at a time, the test
 * note, the clock line, "Next ▶" / "Finish the test"; nothing is sent), and for ⬇ Download / 🖨 Print every question
 * in the same question component, one after another (print layout only).
 */
import { QuizPlayer } from "@/app/quiz/[assignmentId]/quiz-player";
import { QuizQuestion } from "@/components/practice/quiz-question";
import type { ClientQuestion } from "@/server/practice/items";
import type { QuizView } from "@/server/practice/session";
import { useT } from "@/i18n/client";

export function StudentTestPreview({ title, questions, timeLimitMin = null }: { title: string; questions: ClientQuestion[]; timeLimitMin?: number | null }) {
  const t = useT();
  const initial: QuizView = {
    assignmentId: "preview", sessionId: "preview", title, question: questions[0] ?? null, index: 1, total: questions.length, answered: 0, correct: 0, ended: !questions.length,
    goal: null, breakHint: false, nextHref: null, testMode: true, isTest: true, endsAt: null,
  };
  return (
    <div data-testid="student-test-preview">
      {timeLimitMin ? <p className="mb-3 rounded-xl bg-white px-4 py-2 text-brand-navy ring-1 ring-slate-200 print:hidden">⏱ {t("Time limit: {n} minutes (the clock starts when the student opens the test).", { n: timeLimitMin })}</p> : null}
      <div className="print:hidden"><QuizPlayer key={questions.map((q) => q.questionId).join(",")} initial={initial} preview={questions} /></div>
      <ol className="hidden print:block">
        <li className="mb-4 list-none"><h1 className="text-2xl font-bold text-brand-navy">{title}</h1></li>
        {questions.map((q, i) => (
          <li key={q.questionId} className="mb-6 break-inside-avoid list-none">
            <p className="font-semibold text-slate-500">{t("Question {n} of {total}", { n: i + 1, total: questions.length })}</p>
            <QuizQuestion q={q} value={null} onChange={() => undefined} disabled />
          </li>
        ))}
      </ol>
    </div>
  );
}
