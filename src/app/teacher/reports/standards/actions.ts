"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { importMapStandards } from "@/server/map/map-standards";

/** The pasted table: tabs (copied from the page or Excel), else 2+ spaces between cells. */
function pastedTable(text: string): string[][] {
  return text.split(/\r?\n/).map((l) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}|,(?=\s*(?:Yes|No|-)\b)/))).map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** 📐 Uploads NWEA's "Student Proficiency by Standard" (Class Profile → Standards → Student Details) for a class. */
export async function importMapStandardsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let msg: string;
  try {
    const file = f.get("file");
    const text = String(f.get("text") ?? "");
    let table: string[][];
    if (file instanceof File && file.size) {
      if (file.size > 8_000_000) throw new ValidationError("The file is larger than 8 MB.");
      table = extract(file.name, new Uint8Array(await file.arrayBuffer())).table;
    } else if (text.trim()) table = pastedTable(text);
    else throw new ValidationError("Choose NWEA's standards file, or paste the table.");
    const r = await importMapStandards(repo, actor, classId, table);
    msg = `✓ ${r.codes} standards for ${r.matched} of ${r.students} students.` + (r.unmatched.length ? ` Not found in the class: ${r.unmatched.slice(0, 8).join(" · ")}${r.unmatched.length > 8 ? " …" : ""}` : "");
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/teacher/reports/standards?${new URLSearchParams({ classId, source: "map", msg })}`);
}
