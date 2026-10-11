import { NextResponse } from "next/server";
import { toCsv } from "@/imports/csv";
import { apiActor, repo } from "@/server/auth/next";
import { classificationBackup, classificationPreview, previewSheet } from "@/server/map/question-areas";

export const runtime = "nodejs";

/** 🧭 MAP classification files (admins): ?kind=backup (every question's values now) or ?kind=preview (what Apply would save). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") === "preview" ? "preview" : "backup";
  const rows = kind === "backup" ? await classificationBackup(repo, actor) : previewSheet((await classificationPreview(repo, actor)).rows);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="map-classification-${kind}-${day}.csv"`, "Cache-Control": "no-store" } });
}
