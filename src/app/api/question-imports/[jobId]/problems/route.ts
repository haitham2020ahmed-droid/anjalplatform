import { NextResponse } from "next/server";
import { toCsv } from "@/imports/csv";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { importProblemRows } from "@/server/admin/question-import";

/** Download every problem and warning of a question import as a (formula-safe) CSV, by spreadsheet row. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const actor = await apiActor();
  if (!actor || !can(actor, "questions:edit")) return new NextResponse("Please sign in.", { status: 401 });
  const { jobId } = await params;
  try {
    const csv = toCsv(await importProblemRows(repo, actor, jobId));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="question-import-${jobId.slice(-8)}-problems.csv"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
