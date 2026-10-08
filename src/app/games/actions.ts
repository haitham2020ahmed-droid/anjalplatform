"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerGame, createGame, hostAction } from "@/server/game/live";

const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

export async function createGameAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  let target: string;
  try {
    const g = await createGame(repo, actor, { title: String(f.get("title") ?? ""), skillIds: f.getAll("skillIds").map(String), classId: String(f.get("classId") ?? "") || null, count: Number(f.get("count")) || 10, seconds: Number(f.get("seconds")) || 20 });
    target = `/teacher/games/${g.id}`;
  } catch (e) { target = `/teacher/games?msg=${encodeURIComponent(friendly(e))}`; }
  redirect(target);
}

export async function hostGameAction(gameId: string, action: "start" | "reveal" | "next" | "end"): Promise<{ error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  try { await hostAction(repo, actor, gameId, action); return {}; } catch (e) { return { error: friendly(e) }; }
}

export async function joinGameAction(f: FormData): Promise<void> {
  await requireActor({ roles: ["STUDENT"] });
  const code = String(f.get("code") ?? "").replace(/\D/g, "").slice(0, 8);
  redirect(`/play/${code || "0"}`);
}

export async function answerGameAction(gameId: string, index: number, choice: string): Promise<{ correct?: boolean; points?: number; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return await answerGame(repo, actor, gameId, index, choice); } catch (e) { return { error: friendly(e) }; }
}

