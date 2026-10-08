"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { importBridges, resetBridges } from "@/server/curriculum-map/bridge";

export async function importBridgesAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  let msg: string;
  try {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the CSV or Excel file.");
    const { table } = extract(file.name, new Uint8Array(await file.arrayBuffer()));
    const r = await importBridges(repo, actor, table);
    msg = `${r.saved} link(s) saved from your sheet.${r.errors.length ? ` ${r.errors.length} problem(s): ${r.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join(" · ")}` : ""}`;
  } catch (e) { msg = e instanceof ValidationError || e instanceof ForbiddenError ? e.message : `The file could not be read: ${(e as Error).message}`; }
  redirect(`/admin/curriculum-map/bridge?msg=${encodeURIComponent(msg)}`);
}

export async function resetBridgesAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const n = await resetBridges(repo, actor);
  redirect(`/admin/curriculum-map/bridge?msg=${encodeURIComponent(`${n} imported link(s) removed: back to the automatic match.`)}`);
}
