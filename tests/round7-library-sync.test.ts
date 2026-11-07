/** 🔄 round 7: "Update articles from files" re-imports changed article content in chunks (fake data). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncLibraryChunk } from "../src/server/readrise/seed";
import { demoDatabase } from "./helpers/db";

test("syncLibraryChunk creates, then updates a changed explanation, in chunks", async () => {
  const { repo } = await demoDatabase();
  const root = mkdtempSync(join(tmpdir(), "rrsync-"));
  const dir = join(root, "data", "readrise", "articles"); mkdirSync(dir, { recursive: true });
  const src = join(process.cwd(), "data", "readrise", "articles");
  const files = readdirSync(src).filter((f) => f.endsWith(".json")).sort().slice(0, 3);
  for (const f of files) writeFileSync(join(dir, f), readFileSync(join(src, f), "utf8"));
  const a = await syncLibraryChunk(repo, root, 0, 2);
  assert.equal(a.scanned, 2); assert.equal(a.next, 2); assert.equal(a.added, 2);
  const b = await syncLibraryChunk(repo, root, 2, 2);
  assert.equal(b.next, null); assert.equal(b.added, 1);
  // change one band question's explanation in the first file → the next run updates it, creates nothing
  const p = join(dir, files[0]); const j = JSON.parse(readFileSync(p, "utf8"));
  const band = j.bands.LOW; const q = band.questions[0]; q.why = "CHANGED explanation for the test.";
  writeFileSync(p, JSON.stringify(j));
  const c = await syncLibraryChunk(repo, root, 0, 3);
  assert.equal(c.added, 0); assert.deepEqual(c.problems, []);
  const art = (await repo.findMany("RRArticle", { code: j.code }))[0];
  const row = (await repo.findMany("RRQuestion", { articleId: art.id, band: "LOW", number: 1 }))[0];
  assert.match(JSON.stringify(row.rationale), /CHANGED explanation/);
});
