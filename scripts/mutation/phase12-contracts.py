import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("non-unique findUnique in source", "src/server/admin/settings.ts", 'if ((await repo.findMany("Class", { academicYearId: year.id, name })).length)', 'if (await repo.findUnique("Class", { schoolId, name }))', "tests/contracts.test.ts"),
 ("server action without session check", "src/app/admin/actions.ts", 'export async function renameClassAction(_: Result, f: FormData): Promise<Result> {\n  const actor = await requireActor({ permission: "classes:manage" });', 'export async function renameClassAction(_: Result, f: FormData): Promise<Result> {\n  const actor = { userId: "x" } as never;', "tests/contracts.test.ts"),
 ("page without session check", "src/app/admin/roster/page.tsx", '  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });\n  const me = (await getActor())!.user;', '  const me = { displayName: "x" };', "tests/contracts.test.ts"),
 ("route without session check", "src/app/api/admin/roster-template/route.ts", "const actor = await apiActor();", "const actor = { role: 'SCHOOL_ADMIN' } as never;", "tests/contracts.test.ts"),
 ("raw HTML injection", "src/app/parent/page.tsx", '<h2 className="text-xl font-bold text-brand-navy"><bdi>{c.name}</bdi></h2>', '<h2 dangerouslySetInnerHTML={{ __html: c.name }} />', "tests/contracts.test.ts"),
 ("production CSP allows inline scripts", "src/server/auth/csp.ts", "opts.nonce ? `'self' 'nonce-${opts.nonce}' 'strict-dynamic'` : \"'self'\"", "\"'self' 'unsafe-inline'\"", "tests/auth-integration.test.ts"),
 ("CSP back in static headers", "src/server/auth/http.ts", '    { key: "X-Content-Type-Options", value: "nosniff" },', '    { key: "Content-Security-Policy", value: "default-src \'self\'" },\n    { key: "X-Content-Type-Options", value: "nosniff" },', "tests/auth-integration.test.ts"),
 ("Prisma key order from call", "src/server/db/unique-keys.ts", "return { [key.join(\"_\")]: Object.fromEntries(key.map((f) => [f, where[f]])) };", "return { [Object.keys(where).join(\"_\")]: where };", "tests/contracts.test.ts"),
 ("SQLite stops enforcing unique keys", "scripts/db/sqlite-repo.ts", "    matchUniqueKey(UNIQUE_KEYS, model, Object.keys(where)); // same contract as PrismaRepo (Phase 12)", "", "tests/contracts.test.ts"),
 ("teacher class access ignores school", "src/server/teacher/assignments.ts", 'if (actor.role === "TEACHER" && actor.schoolId !== null && actor.schoolId === klass.schoolId) {', 'if (actor.role === "TEACHER") {', "tests/isolation.test.ts"),
]
for name, f, a, b, t in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", t], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
