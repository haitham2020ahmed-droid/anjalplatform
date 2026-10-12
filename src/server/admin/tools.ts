import { can, type Actor } from "../auth/rbac";
import type { AdminTool } from "../../components/admin-tools";

/** May this admin use the tool? (any of its permissions; no permission listed = every admin) */
export function adminMayUse(actor: Actor, tool: AdminTool): boolean {
  if (tool.schoolAdminOnly && actor.role !== "SCHOOL_ADMIN") return false;
  if (!tool.perm) return true;
  return (Array.isArray(tool.perm) ? tool.perm : [tool.perm]).some((p) => can(actor, p));
}
