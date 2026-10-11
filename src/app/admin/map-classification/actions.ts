"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { applyClassification, reviewStandardFix } from "@/server/map/question-areas";

const back = (msg: string, tab = "") => redirect(`/admin/map-classification?${new URLSearchParams({ ...(tab ? { tab } : {}), msg })}`);

/** Apply the classification to the whole bank (after the backup was downloaded). */
export async function applyClassificationAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  let msg: string;
  try {
    if (f.get("backup") !== "1") throw new ValidationError("Download the backup first, then tick the box.");
    const r = await applyClassification(repo, actor);
    msg = `✅ ${r.classified} question(s) classified · ${r.fixed} standard(s) fixed · ${r.suggested} standard suggestion(s) to check · ${r.kept} kept (set by an admin or the import file) · ${r.unclassified} not classified. No question was deleted.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  back(msg);
}

/** Approve or reject the ticked suggested standards. */
export async function reviewFixesAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const ids = f.getAll("fix").map(String).filter(Boolean);
  const approve = f.get("op") === "approve";
  let msg: string;
  try {
    if (!ids.length) throw new ValidationError("Tick at least one suggestion.");
    const n = await reviewStandardFix(repo, actor, ids, approve);
    msg = approve ? `✅ ${n} standard(s) approved: the questions took the new standard and its MAP area.` : `${n} suggestion(s) rejected: the questions keep their standard.`;
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  back(msg, "review");
}
