"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { getQuestion } from "@/server/admin/questions";

export interface QuestionPreview {
  id: string; status: string; stem: string; type: string; level: number; skill: string;
  passage: string | null; image: { url: string; alt: string } | null;
  options: { label: string; text: string; correct: boolean }[];
  /** the correct answer in words, for types without options */
  answer: string | null; whyCorrect: string; tip: string | null;
}

/** 👁 Preview: what the question looks like, with its correct answer (teachers and admins). */
export async function questionPreviewAction(id: string): Promise<{ preview?: QuestionPreview; error?: string }> {
  const actor = await requireActor({ permission: "questions:read" });
  try {
    const d = await getQuestion(repo, actor, String(id ?? ""));
    const i = d.input;
    const answer =
      i.type === "TRUE_FALSE" ? (i.answer ? "True" : "False")
      : i.answers?.length ? i.answers.join(" / ")
      : i.sequence?.length ? i.sequence.join(" → ")
      : i.pairs?.length ? i.pairs.map((p) => `${p.left} → ${p.right}`).join("; ")
      : i.segments?.length && i.errorIndex !== undefined ? `Error: “${i.segments[i.errorIndex]}”${i.correction ? ` → “${i.correction}”` : ""}`
      : null;
    return {
      preview: {
        id: d.id, status: d.status, stem: i.stem, type: String(i.type), level: i.level, skill: String((d as unknown as { skillName?: string }).skillName ?? ""),
        passage: i.passageText?.trim() ? i.passageText : null,
        image: i.imageId ? { url: `/api/question-images/${i.imageId}`, alt: String(i.imageAlt ?? "") } : null,
        options: (i.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: o.correct })),
        answer, whyCorrect: i.whyCorrect, tip: i.tip ?? null,
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 404) return { error: "This question is not available." };
    throw e;
  }
}

/** The selected questions as a list (CSV), for future use. */
export async function selectionCsvAction(ids: string[]): Promise<{ csv?: string; error?: string }> {
  const actor = await requireActor({ permission: "questions:read" });
  const list = [...new Set((ids ?? []).map(String))].slice(0, 500);
  const rows: string[][] = [["Question ID", "Question", "Type", "Difficulty", "Status"]];
  for (const id of list) {
    try {
      const d = await getQuestion(repo, actor, id);
      rows.push([d.id, d.input.stem, String(d.input.type), String(d.input.level), d.status]);
    } catch { /* not in this school or removed: skipped */ }
  }
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return { csv: "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n") };
}
