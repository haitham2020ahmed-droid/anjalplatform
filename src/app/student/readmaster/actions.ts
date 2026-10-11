"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { submitArticle, type ArticleResult, type ArticleTiming } from "@/server/readmaster/service";

export async function submitArticleAction(articleId: string, versionId: string, responses: Record<string, unknown>, timing?: ArticleTiming): Promise<{ ok: true; result: ArticleResult } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, result: await submitArticle(repo, actor, articleId, versionId, responses, new Date(), timing ?? null) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
