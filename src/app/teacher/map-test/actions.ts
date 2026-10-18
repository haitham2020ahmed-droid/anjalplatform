"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { closeWindow, createWindow, draftsFromTest, recalibrateFromReal } from "@/server/map/sim";
import type { Season } from "@/server/map/rit";
import type { Subject } from "@/server/map/map-plan";

const back = (f: FormData, msg: string) => `/teacher/map-test?${new URLSearchParams({ w: String(f.get("windowId") ?? ""), classId: String(f.get("classId") ?? ""), subject: String(f.get("subject") ?? "READING"), msg })}`;
/**
 * 🧯 r79: any error comes back to the page as a message — a known refusal's own text, anything else logged and
 * "Something went wrong — try again" (never Next.js's error page). The sign-in check runs inside `job` too.
 */
async function go(f: FormData, job: () => Promise<string>, name = "map-test"): Promise<never> {
  let msg: string;
  try { msg = await job(); } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "map", name, "/teacher/map-test")}`; }
  redirect(back(f, msg));
}

export async function createWindowAction(f: FormData): Promise<void> {
  await go(f, async () => {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    const day = (k: string) => new Date(`${String(f.get(k))}T${k === "opensAt" ? "04:00" : "20:59"}:00Z`);
    const id = await createWindow(repo, actor, { title: String(f.get("title") ?? ""), grade: f.get("grade") ? Number(f.get("grade")) : null, season: String(f.get("season")) as Season, subjects: f.getAll("subjects").map(String) as Subject[], items: Number(f.get("items")) || 50, opensAt: day("opensAt"), closesAt: day("closesAt") });
    f.set("windowId", id);
    return "✓ Practice test opened. Students were notified.";
  });
}

export async function closeWindowAction(f: FormData): Promise<void> {
  await go(f, async () => {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }); await closeWindow(repo, actor, String(f.get("windowId"))); return "Practice test closed."; });
}

export async function draftsAction(f: FormData): Promise<void> {
  await go(f, async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" }); const n = await draftsFromTest(repo, actor, String(f.get("windowId")), String(f.get("classId")), f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING"); return `✓ ${n} draft plan(s) made from the results. Check and send them in MAP plans → Plans.`; });
}

export async function recalibrateAction(f: FormData): Promise<void> {
  await go(f, async () => {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }); const r = await recalibrateFromReal(repo, actor, String(f.get("windowId"))); return `✓ ${r.questions} question(s) checked against the real MAP; ${r.changed} RIT value(s) corrected.`; });
}
