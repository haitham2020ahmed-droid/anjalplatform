"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { deleteWorksheet, saveWorksheet } from "@/server/teacher/worksheet";

export async function saveWorksheetAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const ids = String(f.get("ids") ?? "").split(",").filter(Boolean);
  let to: string;
  try {
    const id = await saveWorksheet(repo, actor, { id: String(f.get("id") ?? "") || null, title: String(f.get("title") ?? ""), ids, shared: f.get("shared") === "1" });
    to = `/teacher/worksheet?w=${id}&msg=${encodeURIComponent(f.get("shared") === "1" ? "✓ Saved and shared with the English teachers." : "✓ Saved in My worksheets.")}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to = `/teacher/worksheet?msg=${encodeURIComponent(e.message)}`; else throw e; }
  redirect(to);
}

export async function deleteWorksheetAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  await deleteWorksheet(repo, actor, String(f.get("id")));
  redirect(`/teacher/worksheet?msg=${encodeURIComponent("Worksheet deleted.")}`);
}
