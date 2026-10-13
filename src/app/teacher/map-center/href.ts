/** The ONE MAP page and its tabs: Results · MAP Test · Reports · Make a MAP plan. Old MAP routes redirect here. */
export type MapTab = "results" | "test" | "reports" | "plan";
export const MAP_TABS: readonly MapTab[] = ["results", "test", "reports", "plan"];
export const mapTabOf = (v: unknown): MapTab => (MAP_TABS.includes(v as MapTab) ? (v as MapTab) : "results");

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** /teacher/map-center?tab=… keeping the class, the subject (READING | LANGUAGE, any spelling) and the message. */
export function mapCenterHref(tab: MapTab, sp: SP = {}, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ tab });
  if (one(sp.classId) && one(sp.classId) !== "none") p.set("classId", one(sp.classId));
  if (one(sp.subject)) p.set("subject", /^lang/i.test(one(sp.subject)) ? "LANGUAGE" : "READING");
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  if (one(sp.msg)) p.set("msg", one(sp.msg));
  return `/teacher/map-center?${p}`;
}

/** One MAP test's own page (details, progress and reports). */
export const mapTestHref = (id: string, extra: Record<string, string> = {}): string => {
  const q = new URLSearchParams(Object.entries(extra).filter(([, v]) => v)).toString();
  return `/teacher/map-center/test/${encodeURIComponent(id)}${q ? `?${q}` : ""}`;
};
