/**
 * ⚡ One route in detail: database calls per model of the first and the next visit.
 *   npx tsx scripts/perf/probe-route.ts <page file regex> [role]     (BANK=0 for a quick run; "frame:<role>" = AppShell)
 */
import "../../tests/helpers/page-render";
import { bench, measureFrame, measureRoute, pageFiles } from "../../tests/helpers/route-bench";

async function main() {
  const b = await bench({ bigBank: Number(process.env.BANK ?? 0) });
  if (process.env.LAT) b.S.m.latency = Number(process.env.LAT);
  const show = (label: string) => {
    const by = [...b.S.m.stats.byModel.entries()].sort((x, y) => y[1].calls - x[1].calls).map(([m, v]) => `${m}=${v.calls}${v.rows > 200 ? `(${v.rows} rows)` : ""}`);
    console.log(label, b.S.m.stats.calls, "calls:", by.join(" "));
  };
  const arg = process.argv[2];
  if (arg.startsWith("frame:")) {
    const role = arg.slice(6);
    for (const k of ["first", "next"]) { const r = await measureFrame(b, role, `/${role}`); show(`${k} ${r.ms} ms`); }
  } else {
    const re = new RegExp(arg);
    for (const f of pageFiles().filter((x) => re.test(x))) {
      const r = await measureRoute(b, f, { role: process.argv[3] });
      if (!r) { console.log(f, "(no params)"); continue; }
      show(`${r.route} next ${r.warmMs} ms (first ${r.coldMs} ms, ${r.coldCalls} calls) ${r.outcome} ${r.detail ?? ""}`);
    }
  }
  process.exit(0);
}
void main();
