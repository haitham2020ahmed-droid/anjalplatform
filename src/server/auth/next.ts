import { requireActor as requireActorFromRbac } from "./rbac";

export async function getActor() {
  return requireActorFromRbac();
}

export async function requireActor(options?: { roles?: string[] }) {
  const actor = await getActor();

  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (options?.roles && !options.roles.includes(actor.role)) {
    throw new Error("Forbidden");
  }

  return actor;
}
