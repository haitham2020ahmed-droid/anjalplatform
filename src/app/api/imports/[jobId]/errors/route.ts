import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { errorReportCsv } from "@/server/imports/pipeline";

/** Download every problem found in an import as a (formula-safe) CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const { jobId } = await params;
  try {
    const csv = await errorReportCsv(repo, actor, jobId);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${jobId.slice(-8)}-problems.csv"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
