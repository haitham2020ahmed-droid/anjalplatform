/**
 * Password change (by the user) and password reset (by staff).
 *
 * Who may reset whose password:
 *  - SUPER_ADMIN: anyone.
 *  - SCHOOL_ADMIN: any non-super user in their own school.
 *  - TEACHER: students in classes they teach (Grade 4–6 students forget passwords
 *    often; this keeps it in the classroom). Never other staff or parents.
 * A reset issues a temporary password, forces a change at next login and logs the
 * user out everywhere. All of it is audited.
 */
import { randomInt } from "node:crypto";
import type { Repo } from "../seeding/repo";
import { audit } from "../audit";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";
import { canAccessStudent, ForbiddenError, type Actor } from "./rbac";
import { revokeAllSessions } from "./sessions";

const WORDS = ["Blue", "Green", "Sunny", "Quick", "Brave", "Calm", "Bright", "Happy", "Silver", "Golden", "River", "Falcon", "Desert", "Palm", "Star", "Ocean", "Cedar", "Tiger", "Comet", "Maple"];

/** Readable temporary password, e.g. "Brave-Falcon-4821" (meets the policy). */
export function temporaryPassword(): string {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${randomInt(1000, 10000)}`;
}

export async function changePassword(
  repo: Repo,
  userId: string,
  current: string,
  next: string,
  meta: { ip?: string | null } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await repo.findUnique("User", { id: userId });
  if (!user || !user.passwordHash) return { ok: false, message: "Account not found." };
  if (!(await verifyPassword(current, String(user.passwordHash)))) return { ok: false, message: "Your current password is incorrect." };
  const weak = validatePasswordStrength(next);
  if (weak) return { ok: false, message: weak };
  if (await verifyPassword(next, String(user.passwordHash))) return { ok: false, message: "Choose a password different from your current one." };
  await repo.updateMany("User", { id: userId }, { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() });
  await revokeAllSessions(repo, userId); // caller issues a fresh session for this device
  await audit(repo, { actorId: userId, action: "user.password.change", entityType: "User", entityId: userId, ip: meta.ip ?? null });
  return { ok: true };
}

export async function resetPassword(repo: Repo, actor: Actor, targetUserId: string, meta: { ip?: string | null } = {}): Promise<{ temporaryPassword: string }> {
  const target = await repo.findUnique("User", { id: targetUserId });
  if (!target || target.deletedAt) throw new ForbiddenError("User not found.");
  let allowed = false;
  if (actor.role === "SUPER_ADMIN") allowed = true;
  else if (actor.role === "SCHOOL_ADMIN") allowed = target.role !== "SUPER_ADMIN" && target.schoolId === actor.schoolId && actor.schoolId !== null;
  else if (actor.role === "TEACHER" && target.role === "STUDENT") {
    const st = await repo.findUnique("Student", { userId: targetUserId });
    allowed = !!st && canAccessStudent(actor, { studentId: String(st.id), schoolId: String(st.schoolId) });
  }
  if (!allowed) {
    await audit(repo, { actorId: actor.userId, action: "user.password.reset.denied", entityType: "User", entityId: targetUserId, ip: meta.ip ?? null });
    throw new ForbiddenError("You cannot reset this user's password.");
  }
  const temp = temporaryPassword();
  await repo.updateMany("User", { id: targetUserId }, {
    passwordHash: await hashPassword(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null, passwordChangedAt: new Date(),
  });
  await revokeAllSessions(repo, targetUserId);
  await audit(repo, { actorId: actor.userId, action: "user.password.reset", entityType: "User", entityId: targetUserId, ip: meta.ip ?? null });
  return { temporaryPassword: temp };
}
