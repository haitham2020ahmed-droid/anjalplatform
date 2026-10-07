import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { readQuestionImage } from "@/server/admin/question-images";

export const runtime = "nodejs";

/** A question image, for signed-in users (students see it in practice). Images never change once stored. */
export async function GET(_req: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const img = await readQuestionImage(repo, (await params).imageId);
  if (!img) return new NextResponse("Not found.", { status: 404 });
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
