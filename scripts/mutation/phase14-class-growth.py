import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("class growth back to overall average", "src/server/analytics/growth.ts", "const growths = per.map(pairedGrowth).filter", "const growths = per.map((g) => g.growth).filter", "tests/growth-summary.test.ts"),
 ("student report card back to overall average", "src/server/reports/builders.ts", "const paired = pairedGrowth(a.growth);", "const paired = a.growth.growth;", "tests/reports.test.ts"),
]
for name, f, a, b, t in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", t], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
