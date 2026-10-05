/**
 * HTTP load test for a running deployment (Phase 12). Signs in demo users once with a
 * real browser (sign-in is a protected server action), then replays realistic GET
 * traffic with their session cookies and reports latency percentiles and errors.
 *
 *   E2E_BASE_URL=https://staging.example DEMO_PASSWORD=… \
 *   tsx scripts/load/http-load.ts [virtualUsers=30] [seconds=60]
 *
 * Use a STAGING copy with demo data, never production: it creates real sessions and
 * audit entries (report downloads). Targets to compare against (docs/TESTING.md):
 * p95 < 800 ms for pages, < 3 s for PDF reports, error rate < 1 %.
 */
import { chromium } from "@playwright/test";

const base = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const password = process.env.DEMO_PASSWORD ?? "";
const vus = Number(process.argv[2] ?? 30);
const seconds = Number(process.argv[3] ?? 60);
if (!password) throw new Error("Set DEMO_PASSWORD.");

type Kind = "page" | "report" | "health";
interface Target { kind: Kind; path: string }

async function cookieFor(username: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    return (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

async function main() {
  const users = [
    ...Array.from({ length: Math.max(1, vus - 4) }, (_, i) => ({ username: `demo.s${1001 + i}`, targets: [{ kind: "page", path: "/student" }] as Target[] })),
    ...["demo.teacher.4a", "demo.teacher.4b", "demo.teacher.5a"].map((u) => ({ username: u, targets: [{ kind: "page", path: "/teacher" }] as Target[] })),
    { username: "demo.admin", targets: [{ kind: "page", path: "/admin/analytics" }, { kind: "report", path: "/api/reports?kind=school&format=csv&lang=ar&period=TERM" }] as Target[] },
  ].slice(0, vus);
  console.log(`signing in ${users.length} users…`);
  const sessions: { cookie: string; targets: Target[] }[] = [];
  for (const u of users) sessions.push({ cookie: await cookieFor(u.username).catch(() => ""), targets: [...u.targets, { kind: "health", path: "/api/health" }] });
  const live = sessions.filter((s) => s.cookie);
  console.log(`${live.length} signed in; running for ${seconds} s…`);

  const samples: Record<Kind, number[]> = { page: [], report: [], health: [] };
  let errors = 0, total = 0;
  const until = Date.now() + seconds * 1000;
  await Promise.all(live.map(async (s, i) => {
    let k = i;
    while (Date.now() < until) {
      const t = s.targets[k++ % s.targets.length];
      const start = performance.now();
      try {
        const res = await fetch(base + t.path, { headers: { cookie: s.cookie }, redirect: "manual" });
        await res.arrayBuffer();
        total++;
        if (res.status >= 400 || (res.status >= 300 && t.kind !== "page")) errors++;
        else samples[t.kind].push(performance.now() - start);
      } catch {
        total++;
        errors++;
      }
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500)); // think time between clicks
    }
  }));
  const pct = (xs: number[], p: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))].toFixed(0) : "—");
  console.log(`requests: ${total}, errors: ${errors} (${((100 * errors) / Math.max(1, total)).toFixed(2)} %)`);
  for (const k of Object.keys(samples) as Kind[]) console.log(`${k.padEnd(7)} n=${samples[k].length}  p50 ${pct(samples[k], 50)} ms  p95 ${pct(samples[k], 95)} ms  p99 ${pct(samples[k], 99)} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
