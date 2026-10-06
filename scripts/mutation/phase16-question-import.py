import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
T = "tests/question-import.test.ts"
SVC = "src/server/admin/question-import.ts"
muts = [
 ("student data not redacted", "src/server/ai/question-understanding.ts", '    out = out.replace(re, () => {', '    out = out.replace(/(?!)/, () => {'),
 ("short answers served by the engine", "src/server/practice/items.ts", 'return qs.filter((q) => autoScored.has(str(q.typeId))).map(', 'return qs.map('),
 ("teachers may approve on import", SVC, '  if (opts.publish) assertCan(actor, "questions:publish");', ''),
 ("duplicates not detected", SVC, '    if ((whole >= DUPLICATE_THRESHOLD || stemOnly >= SAME_STEM_THRESHOLD) && (!best || s > best.score))', '    if (false)'),
 ("same question with new options not a duplicate", SVC, 'const s = Math.max(whole, stemOnly >= SAME_STEM_THRESHOLD ? stemOnly : 0);\n    if ((whole >= DUPLICATE_THRESHOLD || stemOnly >= SAME_STEM_THRESHOLD)', 'const s = whole;\n    if ((whole >= DUPLICATE_THRESHOLD)'),
 ("in-file duplicates not detected", SVC, '    const inFile = seen.find(', '    const inFile = false && seen.find('),
 ("skip decision ignored", SVC, '    if (!l.selected || (l.status === "DUPLICATE" && l.decision === "SKIP") || l.decision === "SKIP") {', '    if (!l.selected) {'),
 ("replace does not archive", SVC, '          await repo.updateMany("Question", { id: old.id }, { status: "ARCHIVED", updatedAt: now });', ''),
 ("finished imports still editable", SVC, '  if (job.status !== "AWAITING_CONFIRMATION") throw new ValidationError("This import has already started or finished; it can no longer be changed.");', ''),
 ("other schools can open imports", SVC, '  if (!uploader || uploader.schoolId !== schoolOf(actor)) throw new ForbiddenError("Import not found.");', ''),
 ("no bank validation in preview", SVC, '      if (!errors.length) errors.push(...(await checkQuestion(repo, actor, input2)));', ''),
 ("unknown files accepted", "src/imports/questions/extract.ts", '  if (["doc", "xls", "ppt"].includes(ext)) throw new ExtractError', '  if (false) throw new ExtractError'),
 ("missing answers not reported", "src/imports/questions/parse.ts", '  if (!nCorrect) problems.push("no correct answer found");', ''),
 ("AI not used when rules fail", SVC, '  const rulesFailed = !parsed.questions.length || parsed.questions.every((q) => q.problems.length > 0);', '  const rulesFailed = !parsed.questions.length;'),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", T], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
