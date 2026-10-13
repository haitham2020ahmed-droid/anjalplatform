"use server";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createMapTest, editManualItems, testDetail, testPool, updateMapTest, type ItemOp } from "@/server/map/map-test";
import type { GroupKey, Subject } from "@/server/map/map-plan";
import type { Season } from "@/server/map/rit";
import { mapTestHref } from "./href";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const day = (v: string, end: boolean): Date | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "20:59" : "04:00"}:00Z`) : undefined);
const subjectOf = (f: FormData): Subject => (str(f, "subject") === "LANGUAGE" ? "LANGUAGE" : "READING");
const sharesOf = (f: FormData): Record<string, number> | null => {
  const out: Record<string, number> = {};
  for (const k of ["LIT", "INFO", "VOCAB", "GRAMMAR", "MECH", "WRITING"]) if (f.get(`share_${k}`) !== null) out[k] = Number(f.get(`share_${k}`));
  return Object.keys(out).length ? out : null;
};
const manualOf = (f: FormData) => ({ areas: f.getAll("areas").map(String) as GroupKey[], count: Number(str(f, "count")) || 20, ritLow: Number(str(f, "ritLow")) || 180, ritHigh: Number(str(f, "ritHigh")) || 230 });

async function run(job: () => Promise<string>, back: (msg: string) => string): Promise<never> {
  const { t } = await getT();
  let to: string;
  try { to = await job(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) to = back(`⚠️ ${t(e.message)}`); else throw e; }
  redirect(to);
}
const tabBack = (f: FormData) => (msg: string) => `/teacher/map-center?${new URLSearchParams({ tab: "test", subject: subjectOf(f), msg })}`;
const testBack = (f: FormData, extra: Record<string, string> = {}) => (msg: string) => mapTestHref(str(f, "id"), { ...extra, msg });

/** The tab's two big buttons: an automatic test (opens on its dates) or a manual one (a draft to build). */
export async function createMapTestAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  await run(async () => {
    const kind = str(f, "kind") === "MANUAL" ? "MANUAL" : "AUTO";
    const id = await createMapTest(repo, actor, {
      kind, subject: subjectOf(f), title: str(f, "title"), classIds: f.getAll("classIds").map(String), studentIds: f.getAll("studentIds").map(String),
      opensAt: day(str(f, "opensAt"), false) ?? new Date(NaN), closesAt: day(str(f, "closesAt"), true) ?? new Date(NaN),
      items: Number(str(f, "items")) || null, shares: kind === "AUTO" ? sharesOf(f) : null, season: (str(f, "season") || null) as Season | null,
      manual: kind === "MANUAL" ? manualOf(f) : null,
    });
    return mapTestHref(id, { msg: kind === "AUTO" ? t("✓ The MAP Test is ready. Students were told; it is in their My Work.") : t("✓ Draft made from the bank. Check and edit the questions, then assign it.") });
  }, tabBack(f));
}

/** The test page: dates, students, title, length, area shares, publish (edits allowed before anyone starts). */
export async function updateMapTestAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  await run(async () => {
    const part = str(f, "part");
    if (part === "dates") await updateMapTest(repo, actor, str(f, "id"), { opensAt: day(str(f, "opensAt"), false), closesAt: day(str(f, "closesAt"), true) });
    else if (part === "who") await updateMapTest(repo, actor, str(f, "id"), { classIds: f.getAll("classIds").map(String), studentIds: f.getAll("studentIds").map(String) });
    else if (part === "settings") await updateMapTest(repo, actor, str(f, "id"), { title: str(f, "title"), ...(f.get("items") !== null ? { items: Number(str(f, "items")) } : {}), ...(sharesOf(f) ? { shares: sharesOf(f) } : {}) });
    else if (part === "publish") await updateMapTest(repo, actor, str(f, "id"), { publish: true });
    else if (part === "close") await updateMapTest(repo, actor, str(f, "id"), { closesAt: new Date() });
    return mapTestHref(str(f, "id"), { msg: part === "publish" ? t("✓ Assigned. Students see it in My Work and in My MAP.") : t("Saved.") });
  }, testBack(f));
}

/** Automatic test → the pool of one goal area: the ticked questions are taken out (the others put back). */
export async function excludeAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  const area = str(f, "area") as GroupKey;
  await run(async () => {
    const [shown] = (await testPool(repo, actor, str(f, "id"), { area, limit: 400 })).filter((a) => a.key === area);
    const before = new Set((await testDetail(repo, actor, str(f, "id"))).excluded);
    const onPage = new Set((shown?.items ?? []).map((q) => q.id));
    const ticked = new Set(f.getAll("exclude").map(String));
    const next = [...[...before].filter((id) => !onPage.has(id)), ...[...ticked].filter((id) => onPage.has(id))];
    await updateMapTest(repo, actor, str(f, "id"), { excludedIds: next });
    return mapTestHref(str(f, "id"), { area, msg: t("Pool saved: {n} question(s) taken out.", { n: next.length }) });
  }, testBack(f, { area }));
}

/** Manual test: remove / move / replace / add one item, or "Suggest for me" again. */
export async function itemOpAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  const op = str(f, "op");
  await run(async () => {
    const o: ItemOp = op === "resuggest" ? { op: "resuggest", manual: manualOf(f) }
      : op === "add" ? { op: "add", id: str(f, "questionId") || null, area: (str(f, "area") || null) as GroupKey | null }
      : { op: (["remove", "up", "down", "replace"].includes(op) ? op : "remove") as "remove", id: str(f, "questionId") };
    await editManualItems(repo, actor, str(f, "id"), o);
    return mapTestHref(str(f, "id"), { area: str(f, "area"), msg: t("Saved.") }) + "#items";
  }, testBack(f, { area: str(f, "area") }));
}
