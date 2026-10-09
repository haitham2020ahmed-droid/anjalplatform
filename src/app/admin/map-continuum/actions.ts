"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { importContinuum } from "@/server/map/continuum";

/** 📘 Imports the school's MAP Growth Learning Continuum (Excel / CSV, one row per statement). */
export async function importContinuumAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  let msg: string;
  try {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the continuum file (Excel or CSV).");
    if (file.size > 8_000_000) throw new ValidationError("The file is larger than 8 MB.");
    const r = await importContinuum(repo, actor, extract(file.name, new Uint8Array(await file.arrayBuffer())).table);
    msg = r.errors.length
      ? `⚠️ Nothing imported: ${r.errors.length} problem(s). ${r.errors.slice(0, 6).map((e) => `row ${e.row}: ${e.message}`).join(" · ")}`
      : `✓ ${r.saved} statements imported (${Object.entries(r.bySubject).map(([k, n]) => `${k === "READING" ? "Reading" : "Language Usage"} ${n}`).join(", ")}). Study plans and group plans use them now.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/map-continuum?msg=${encodeURIComponent(msg)}`);
}
