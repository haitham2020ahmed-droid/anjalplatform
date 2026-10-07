import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveActor } from "../src/server/auth/actor";
import { removeLogo, schoolLogoFor, uploadLogo } from "../src/server/admin/settings";
import { loadBranding } from "../src/server/reports/service";
import { demoDatabase } from "./helpers/db";

// a valid 1×1 PNG
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

describe("school logo survives redeploys (stored in the database)", () => {
  test("upload → the reports find it even with an empty branding folder; remove deletes it", async () => {
    const { repo } = await demoDatabase();
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const dir = mkdtempSync(join(tmpdir(), "branding-"));
    try {
      const ref = await uploadLogo(repo, admin, PNG, dir);
      assert.match(ref, /^db:/);
      assert.deepEqual(readdirSync(dir), [], "nothing is written to the server disk");
      // a “redeploy”: a brand-new, empty branding folder
      const fresh = mkdtempSync(join(tmpdir(), "branding-new-"));
      const b = await loadBranding(repo, admin.schoolId!, fresh);
      assert.ok(b.logo, "the report still has the logo");
      assert.equal(b.warning, null);
      await uploadLogo(repo, admin, PNG, dir);
      assert.equal(await repo.count("SchoolAsset", { schoolId: admin.schoolId!, kind: "LOGO" }), 1, "replacing keeps one logo");
      await removeLogo(repo, admin);
      assert.equal(await repo.count("SchoolAsset", { schoolId: admin.schoolId!, kind: "LOGO" }), 0);
      assert.equal((await loadBranding(repo, admin.schoolId!, fresh)).logo, null);
      rmSync(fresh, { recursive: true, force: true });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("the app shows the uploaded logo (header and sign-in page), else the built-in default", async () => {
    const { repo } = await demoDatabase();
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const dir = mkdtempSync(join(tmpdir(), "branding-"));
    try {
      assert.equal(await schoolLogoFor(repo, admin.schoolId!), null, "nothing uploaded → the default logo");
      await uploadLogo(repo, admin, PNG, dir);
      const mine = await schoolLogoFor(repo, admin.schoolId!);
      assert.equal(mine?.mime, "image/png");
      assert.deepEqual([...mine!.bytes], [...PNG]);
      // before sign-in: the real school's logo, never a demo/test school's
      await repo.updateMany("School", { id: admin.schoolId! }, { isDemo: true });
      assert.equal(await schoolLogoFor(repo, null), null);
      await repo.updateMany("School", { id: admin.schoolId! }, { isDemo: false });
      assert.equal((await schoolLogoFor(repo, null))?.mime, "image/png");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
