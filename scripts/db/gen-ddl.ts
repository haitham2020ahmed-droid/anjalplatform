import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDDL, parseSchema } from "./schema-ddl";
const root = join(__dirname, "..", "..");
const s = parseSchema(join(root, "prisma/schema.prisma"));
const header = (d: string) => `-- GENERATED from prisma/schema.prisma (${d}). Reference only — the authoritative MySQL\n-- migration is produced by \`prisma migrate dev\`. Do not edit by hand.\n\n`;
writeFileSync(join(root, "database/ddl/mysql-reference.sql"), header("MySQL 8") + generateDDL(s, "mysql"));
writeFileSync(join(root, "database/ddl/sqlite-verify.sql"), header("SQLite, offline verification") + generateDDL(s, "sqlite"));
console.log(`models ${s.models.size}, enums ${s.enums.size}`);
