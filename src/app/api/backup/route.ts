import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { backupSheets } from "@/server/teacher/extras";
import { workbookXlsx } from "@/imports/questions/template-files";
import { audit } from "@/server/audit";

export const runtime = "nodejs";

/** 💾 The school's data as one Excel workbook (admin only; the download is logged). */
export async function GET() {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Forbidden", { status: 403 });
  try {
    const sheets = await backupSheets(repo, actor);
    const bytes = workbookXlsx(sheets.map((s) => ({ name: s.name, rows: s.rows, widths: s.rows[0].map((h) => Math.max(12, h.length + 4)), headerStyle: true, freeze: true })));
    await audit(repo, { actorId: actor.userId, action: "backup.download", entityType: "School", entityId: actor.schoolId, after: { sheets: sheets.length } });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="alanjal-backup-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
