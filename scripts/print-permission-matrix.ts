import { permissionMatrix } from "../src/server/auth/rbac";
const roles = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"] as const;
const m = permissionMatrix();
console.log(`| Permission | ${roles.join(" | ")} |`);
console.log(`|---|${roles.map(() => ":-:").join("|")}|`);
for (const [p, row] of Object.entries(m)) console.log(`| \`${p}\` | ${roles.map((r) => (row[r] ? "✓" : "—")).join(" | ")} |`);
