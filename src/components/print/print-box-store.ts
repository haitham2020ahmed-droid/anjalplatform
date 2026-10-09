/**
 * 🖨 The print box (teacher / admin): questions picked anywhere with the 🖨 button, kept in this browser until
 * printed. A browser event keeps the header icon and every button in step.
 */
export interface BoxItem { id: string; stem: string }
const KEY = "anjal.printbox.v1";
export const BOX_EVENT = "anjal-printbox";
export const BOX_MAX = 40;

export function readBox(): BoxItem[] {
  try { const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as BoxItem[]; return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string").slice(0, BOX_MAX) : []; } catch { return []; }
}
export function writeBox(items: BoxItem[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, BOX_MAX))); } catch { /* private mode: the box lives until reload */ }
  window.dispatchEvent(new CustomEvent(BOX_EVENT, { detail: items }));
}
export function toggleBox(item: BoxItem): BoxItem[] {
  const now = readBox();
  const next = now.some((x) => x.id === item.id) ? now.filter((x) => x.id !== item.id) : now.length >= BOX_MAX ? now : [...now, { id: item.id, stem: item.stem.slice(0, 140) }];
  writeBox(next);
  return next;
}
