"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { DEFAULT_LADDER, setLadderSettings, type LadderSettings } from "@/server/curriculum-map/ladder-settings";
import { setCoordinators } from "@/server/teacher/coordinators";
import type { Result } from "../actions";

/** ⚙️ Level movement (up / down) and the “mastered” rule. */
export async function ladderAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:school" });
  try {
    if (f.get("reset") === "true") { await setLadderSettings(repo, actor, null); revalidatePath("/admin/settings"); return { message: "Back to the default rules." }; }
    const v: Partial<LadderSettings> = {};
    for (const k of Object.keys(DEFAULT_LADDER) as (keyof LadderSettings)[]) { const raw = String(f.get(k) ?? "").trim(); if (raw) v[k] = Number(raw); }
    await setLadderSettings(repo, actor, v);
    revalidatePath("/admin/settings");
    return { message: "Saved. New answers follow these rules." };
  } catch (e) { if (e instanceof ValidationError) return { error: e.message }; throw e; }
}

/** 🧑‍🏫 Grade coordinators: “coord:<userId>” = the grades ticked for that teacher. */
export async function coordinatorsAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:school" });
  try {
    const ids = f.getAll("teacher").map(String);
    const n = await setCoordinators(repo, actor, ids.map((userId) => ({ userId, grades: f.getAll(`coord:${userId}`).map(Number) })));
    revalidatePath("/admin/settings");
    return { message: n ? `Saved: ${n} coordinator(s).` : "Saved: no coordinators." };
  } catch (e) { if (e instanceof ValidationError) return { error: e.message }; throw e; }
}
