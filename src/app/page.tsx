import { redirect } from "next/navigation";
import { getActor, HOME_BY_ROLE } from "@/server/auth/next";

/** Sends each signed-in user to their own home; everyone else to /login. */
export default async function Home() {
  const s = await getActor();
  redirect(s ? HOME_BY_ROLE[s.actor.role] : "/login");
}
