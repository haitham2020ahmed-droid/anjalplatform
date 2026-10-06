import { redirect } from "next/navigation";

export async function requireActor() {
  return {
    id: "system",
    role: "SUPER_ADMIN",
  };
}

export async function repo() {
  return {};
}

export function requireAuth() {
  return true;
}
