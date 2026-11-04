/**
 * 🧰 adminMayUse (src/server/admin/tools.ts): the single gatekeeping function that decides whether an admin tool
 * shows up in the admin home / menu (src/app/admin/page.tsx, src/app/admin/all/page.tsx) for a given actor —
 * `schoolAdminOnly` tools hide from SUPER_ADMIN, and a tool's `perm` (one permission or several, any-of) must be
 * held or the tool is hidden. No test file referenced this function before this one (audit finding, Oct 2026, P2 #9).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AdminTool } from "../src/components/admin-tools";
import type { Actor } from "../src/server/auth/rbac";
import { adminMayUse } from "../src/server/admin/tools";

const actor = (role: Actor["role"], extraPermissions: Actor["extraPermissions"] = []): Actor => ({ userId: "u1", role, schoolId: "s1", extraPermissions });

describe("🧰 adminMayUse", () => {
  test("no perm listed at all: every admin may use the tool", () => {
    const tool: AdminTool = { href: "/admin/anything", label: "Anything", icon: "🔧", group: "school" };
    assert.equal(adminMayUse(actor("SCHOOL_ADMIN"), tool), true);
    assert.equal(adminMayUse(actor("SUPER_ADMIN"), tool), true);
  });

  test("a single required permission: only an actor who holds it may use the tool", () => {
    const tool: AdminTool = { href: "/admin/users", label: "Users", icon: "👥", group: "school", perm: "students:manage" };
    assert.equal(adminMayUse(actor("SCHOOL_ADMIN"), tool), true, "SCHOOL_ADMIN holds every non-schools:manage permission");
    assert.equal(adminMayUse(actor("TEACHER"), tool), false, "a plain teacher does not manage students");
  });

  test("a list of permissions is any-of, not all-of", () => {
    const tool: AdminTool = { href: "/admin/users", label: "Users", icon: "👥", group: "school", perm: ["analytics:class", "students:manage"] };
    // a teacher holds analytics:class but not students:manage — one of the two is enough
    assert.equal(adminMayUse(actor("TEACHER"), tool), true);
    const noneOfThem = actor("STUDENT");
    assert.equal(adminMayUse(noneOfThem, tool), false);
  });

  test("schoolAdminOnly hides the tool from everyone except SCHOOL_ADMIN, even SUPER_ADMIN", () => {
    const tool: AdminTool = { href: "/admin/school", label: "School Overview", icon: "🏫", group: "school", schoolAdminOnly: true };
    assert.equal(adminMayUse(actor("SCHOOL_ADMIN"), tool), true);
    assert.equal(adminMayUse(actor("SUPER_ADMIN"), tool), false, "schoolAdminOnly excludes the platform admin too");
    assert.equal(adminMayUse(actor("TEACHER"), tool), false);
  });

  test("schoolAdminOnly is checked before perm: a SCHOOL_ADMIN still needs the listed permission too", () => {
    const tool: AdminTool = { href: "/admin/school", label: "School Overview", icon: "🏫", group: "school", schoolAdminOnly: true, perm: "classes:manage" };
    assert.equal(adminMayUse(actor("SCHOOL_ADMIN"), tool), true);
    assert.equal(adminMayUse(actor("SUPER_ADMIN"), tool), false, "fails the schoolAdminOnly gate before the permission is even checked");
  });

  test("extraPermissions (a per-user grant) can unlock a tool a role would not otherwise see", () => {
    const tool: AdminTool = { href: "/admin/questions/publish", label: "Publish", icon: "✅", group: "settings", perm: "questions:publish" };
    assert.equal(adminMayUse(actor("TEACHER"), tool), false);
    assert.equal(adminMayUse(actor("TEACHER", ["questions:publish"]), tool), true, "a lead teacher's extra grant unlocks the tool");
  });
});
