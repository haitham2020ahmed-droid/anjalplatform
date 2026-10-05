/**
 * First admin account (Phase 13). Every admin action needs an existing admin, so the
 * very first one is created from the server shell (only someone with server access can):
 *   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm jobs \
 *     npm run admin:create -- --school=ALANJAL --username=d.eskandrany --name="Doaa Eskandrany"
 * The temporary password is printed once and must be changed at first sign-in.
 */
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../auth/passwords-admin";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";
import { cleanName, cleanUsername } from "./users";

export async function createSchoolAdmin(repo: Repo, input: { schoolCode: string; username: string; displayName: string; email?: string | null }, now = new Date()): Promise<{ userId: string; temporaryPassword: string }> {
  const school = await repo.findUnique("School", { code: input.schoolCode });
  if (!school) throw new ValidationError(`School "${input.schoolCode}" not found. Run the curriculum seed first (npm run db:seed:curriculum).`);
  const username = cleanUsername(input.username);
  const displayName = cleanName(input.displayName);
  if (await repo.findUnique("User", { username })) throw new ValidationError(`Username "${username}" already exists.`);
  const temp = temporaryPassword();
  const u = await repo.create("User", {
    username, displayName, email: input.email ? String(input.email).trim().toLowerCase() : null, role: "SCHOOL_ADMIN", schoolId: school.id,
    passwordHash: await hashPassword(temp), mustChangePassword: true, isActive: true, createdAt: now, updatedAt: now,
  });
  await audit(repo, { actorId: null, action: "user.bootstrap", entityType: "User", entityId: String(u.id), after: { username, role: "SCHOOL_ADMIN", school: input.schoolCode, via: "server shell" }, at: now });
  return { userId: String(u.id), temporaryPassword: temp };
}
