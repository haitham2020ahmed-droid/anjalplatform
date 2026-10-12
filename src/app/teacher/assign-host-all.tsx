import { AssignSkillHost } from "./assign-dialog";
import { getActor, repo } from "@/server/auth/next";
import { teacherRoster } from "@/server/teacher/assign";

type Track = "CURRICULUM" | "MAP" | "NAFS";
/**
 * The page's assign dialog with EVERY class the teacher teaches (one bounded read), so a skill can be assigned to
 * several classes at once. Admins (no own classes) get the page's class only, as before.
 */
export async function AssignHostAll(props: { classId: string; className: string; students: { id: string; name: string }[]; track?: Track }) {
  const me = await getActor();
  const classes = me && me.actor.role === "TEACHER" ? await teacherRoster(repo, me.actor).catch(() => []) : [];
  return <AssignSkillHost {...props} classes={classes.length ? classes.map((c) => ({ id: c.id, name: c.name, students: c.students })) : undefined} />;
}
