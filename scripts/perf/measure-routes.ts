/**
 * ⚡ Server time and database calls of a navigation to every page route, on the speed-test school (in-memory SQLite,
 * 3 ms per database call):
 *   npx tsx scripts/perf/measure-routes.ts [out.json] [route-filter]
 * Prints the table, slowest first. Test data only — never a real database.
 */
import "../../tests/helpers/page-render";
import { writeFileSync } from "node:fs";
import { bench, measureFrame, measureRoute, pageFiles, routeTable, type RouteRow } from "../../tests/helpers/route-bench";

async function main() {
  const out = process.argv[2];
  const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
  const b = await bench({ bigBank: Number(process.env.BANK ?? 14000) });
  const rows: RouteRow[] = [];
  for (const [role, path] of [["student", "/student"], ["teacher", "/teacher"], ["admin", "/admin"], ["parent", "/parent"]]) {
    for (const part of ["page", "layout"] as const) {
      const a = await measureFrame(b, role, path, part), c = await measureFrame(b, role, path, part);
      console.log(`frame ${role} (${part === "page" ? "each navigation" : "section layout, once"}): first ${a.ms} ms ${a.calls} calls · next ${c.ms} ms ${c.calls} calls · ${c.clientKB} KB to the browser`);
    }
  }
  for (const f of pageFiles()) {
    if (filter && !filter.test(f)) continue;
    const r = await measureRoute(b, f).catch((e) => ({ route: f, file: f, role: "?", coldMs: 0, coldCalls: 0, warmMs: 0, warmCalls: 0, clientKB: 0, outcome: "error", detail: String(e).slice(0, 200) }));
    if (!r) continue;
    rows.push(r);
    process.stderr.write(`${r.route} ${r.coldMs}/${r.warmMs} ms ${r.coldCalls}/${r.warmCalls} calls ${r.outcome}\n`);
  }
  rows.sort((a, b) => b.coldMs + b.warmMs - (a.coldMs + a.warmMs));
  console.log(routeTable(rows));
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
  process.exit(0);
}
void main();
