import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
T = "tests/ai-bank.test.ts"
muts = [
 ("engine uses unapproved questions", "src/server/practice/items.ts", 'status: "PUBLISHED", deletedAt: null });', 'deletedAt: null });'),
 ("anyone may approve AI drafts", "src/server/admin/questions.ts", '  assertCan(actor, "questions:review");\n  const q = await questionInSchool(repo, actor, id);\n  if (q.origin !== "AI_GENERATED") throw new ValidationError("Only AI-drafted questions are approved here', '  const q = await questionInSchool(repo, actor, id);\n  if (q.origin !== "AI_GENERATED") throw new ValidationError("Only AI-drafted questions are approved here'),
 ("teachers may generate", "src/server/admin/ai-bank.ts", 'export async function generateQuestions(repo: Repo, actor: Actor, provider: AiProvider, req: GenerateRequest, now = new Date()): Promise<GenerateResult> {\n  assertCan(actor, "questions:generate");', 'export async function generateQuestions(repo: Repo, actor: Actor, provider: AiProvider, req: GenerateRequest, now = new Date()): Promise<GenerateResult> {'),
 ("approved without being saved as PUBLISHED", "src/server/admin/questions.ts", '{ status: "PUBLISHED", aiStatus: "APPROVED"', '{ status: "UNDER_REVIEW", aiStatus: "APPROVED"'),
 ("reject without a reason", "src/server/admin/questions.ts", '  const r = text(reason, "Reason", 500);\n  await repo.updateMany("Question", { id }, { status: "ARCHIVED", aiStatus: "REJECTED"', '  const r = reason;\n  await repo.updateMany("Question", { id }, { status: "ARCHIVED", aiStatus: "REJECTED"'),
 ("wrong skill accepted", "src/server/admin/ai-bank.ts", 'if (String(r.skillCode ?? "").trim() !== ctx.skillCode) reasons.push', 'if (false) reasons.push'),
 ("wrong standard accepted", "src/server/admin/ai-bank.ts", 'if (std !== ctx.requestedStandard) reasons.push', 'if (false) reasons.push'),
 ("wrong difficulty accepted", "src/server/admin/ai-bank.ts", 'if (Number(r.level) !== slot.level) reasons.push', 'if (false) reasons.push'),
 ("duplicates accepted", "src/server/admin/ai-bank.ts", '          reasons.push(`duplicate of an existing question', '          if (false) reasons.push(`duplicate of an existing question'),
 ("missing explanation accepted", "src/server/admin/ai-bank.ts", 'if (typeof r.explanation !== "string" || !r.explanation.trim()) reasons.push', 'if (false) reasons.push'),
 ("drafts not counted toward target", "src/server/admin/ai-bank.ts", 'Math.max(0, t[b] - ab[b] - pb[b])', 'Math.max(0, t[b] - ab[b])'),
 ("unlinked standard allowed", "src/server/admin/ai-bank.ts", '  if (!standard) throw new ValidationError("Choose a standard that is linked to this skill.");', '  if (!standard) return contextFor(repo, actor, { ...req, standardId: String(stds[0].id) });'),
 ("AI module imports the database layer", "src/server/ai/question-generator.ts", 'export interface GenerationContext {', 'import type { Repo } from "../seeding/repo";\nexport type _R = Repo;\nexport interface GenerationContext {'),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", T], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
