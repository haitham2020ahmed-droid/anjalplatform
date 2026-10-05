/** npm run admin:create -- --school=ALANJAL --username=… --name="…" [--email=…]  (see src/server/admin/bootstrap.ts) */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { createSchoolAdmin } from "../../src/server/admin/bootstrap";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const prisma = new PrismaClient();

createSchoolAdmin(new PrismaRepo(prisma), { schoolCode: arg("school") ?? "ALANJAL", username: arg("username") ?? "", displayName: arg("name") ?? "", email: arg("email") ?? null })
  .then((r) => {
    console.log(`School admin created. Temporary password (shown once, must be changed at first sign-in):\n\n    ${r.temporaryPassword}\n`);
  })
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
