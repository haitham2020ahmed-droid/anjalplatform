import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
T = "tests/bulk-publish.test.ts"
Q = "src/server/admin/questions.ts"
muts = [
 ("archived questions published", Q, 'export const PUBLISHABLE: readonly QuestionStatus[] = ["DRAFT", "UNDER_REVIEW"];', 'export const PUBLISHABLE: readonly QuestionStatus[] = ["DRAFT", "UNDER_REVIEW", "ARCHIVED"];'),
 ("published without validation", Q, '  await toBankItem(repo, actor, form.input, String(q.externalRef ?? id));\n  const revisionOf = (q.tags as { revisionOf?: string } | null)?.revisionOf;\n  await repo.transaction', '  void form;\n  const revisionOf = (q.tags as { revisionOf?: string } | null)?.revisionOf;\n  await repo.transaction'),
 ("teachers may bulk publish", Q, 'export async function publishQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<BulkPublishResult> {\n  assertCan(actor, "questions:publish");', 'export async function publishQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<BulkPublishResult> {'),
 ("Publish All open to teachers", Q, 'export async function publishableIds(repo: Repo, actor: Actor, filter: Parameters<typeof listQuestions>[2] = {}): Promise<string[]> {\n  assertCan(actor, "questions:publish");', 'export async function publishableIds(repo: Repo, actor: Actor, filter: Parameters<typeof listQuestions>[2] = {}): Promise<string[]> {'),
 ("no batch limit", Q, '  if (unique.length > BULK_PUBLISH_MAX) throw', '  if (false) throw'),
 ("old version not archived", Q, '    if (revisionOf) await tx.updateMany("Question", { id: revisionOf, status: "PUBLISHED" }, { status: "ARCHIVED", updatedAt: now });\n  });\n  await audit(repo, {\n', '  });\n  await audit(repo, {\n'),
 ("bulk not recorded in audit", Q, '...(extra.bulk ? { bulk: true } : {})', '...({})'),
 ("one failure stops the batch", Q, '      if (!(e instanceof ValidationError) && !(e instanceof ForbiddenError)) throw e;\n      out.skipped.push({ id, stem, reason: e.message });', '      throw e;'),
 ("single review accepts drafts", Q, '  if (q.status !== "UNDER_REVIEW") throw new ValidationError("Only questions under review can be approved or sent back.");', ''),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", T], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
