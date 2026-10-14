/**
 * 🔎 The shared combobox's logic (pure — the component is src/components/ui/combo.tsx). The platform's picker rule:
 * clicking or focusing a picker opens the FULL list at once (grouped, scrollable); typing filters it live; never an
 * empty box where the user must type first. Lists longer than VIRTUAL_FROM rows are virtualised.
 */
export interface ComboOption {
  value: string;
  label: string;
  /** the group heading the option is listed under (options keep their order inside a group) */
  group?: string;
  /** a second, smaller line (a count, a class, a code's full name …) — searched too */
  hint?: string;
  /** more words that find the option (other names, genre, kind …) — never shown */
  keywords?: string;
  disabled?: boolean;
}

/** A row of the open list: a group heading or an option (index into the options). */
export type ComboRow = { kind: "group"; label: string } | { kind: "option"; index: number };

/** Lists longer than this many rows are virtualised (only the visible rows are drawn). */
export const VIRTUAL_FROM = 300;
/** The height of one row in pixels (the virtual list's step) and the list's visible height. */
export const ROW_PX = 44;
export const LIST_PX = 320;

/** Lower case, accents / Arabic diacritics removed, "&" = "and", apostrophes ignored, spaces collapsed. */
export function fold(text: string): string {
  return String(text ?? "")
    .normalize("NFKD").replace(/[̀-ًͯ-ٰٟ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "").replace(/\s+/g, " ").trim();
}

/** Every word of the query must appear in the option's label, hint, group or keywords. An empty query keeps all. */
export function filterOptions(options: readonly ComboOption[], query: string, match?: (option: ComboOption, query: string) => boolean): number[] {
  const words = fold(query).split(" ").filter(Boolean);
  const out: number[] = [];
  options.forEach((o, i) => {
    if (!words.length) { out.push(i); return; }
    // a picker's own search rules (e.g. a skill's other names), else every word must appear
    if (match) { if (match(o, query)) out.push(i); return; }
    const hay = fold(`${o.label} ${o.hint ?? ""} ${o.group ?? ""} ${o.keywords ?? ""} ${o.value}`);
    if (words.every((w) => hay.includes(w))) out.push(i);
  });
  return out;
}

/** The open list's rows: options under their group headings (groups in first-seen order). */
export function buildRows(options: readonly ComboOption[], visible: readonly number[]): ComboRow[] {
  const groups = new Map<string, number[]>();
  const loose: number[] = [];
  for (const i of visible) {
    const g = options[i].group;
    if (!g) { loose.push(i); continue; }
    const l = groups.get(g) ?? [];
    l.push(i);
    groups.set(g, l);
  }
  const rows: ComboRow[] = loose.map((index) => ({ kind: "option", index }));
  for (const [label, list] of groups) { rows.push({ kind: "group", label }); for (const index of list) rows.push({ kind: "option", index }); }
  return rows;
}

/** Keyboard: the next option row from `from` (−1 = none yet) in direction `step`, skipping headings and disabled options. */
export function moveActive(rows: readonly ComboRow[], options: readonly ComboOption[], from: number, step: 1 | -1 | "first" | "last"): number {
  const ok = (r: number) => rows[r]?.kind === "option" && !options[(rows[r] as { index: number }).index].disabled;
  if (step === "first") { for (let r = 0; r < rows.length; r++) if (ok(r)) return r; return -1; }
  if (step === "last") { for (let r = rows.length - 1; r >= 0; r--) if (ok(r)) return r; return -1; }
  if (!rows.length) return -1;
  let r = from;
  for (let n = 0; n < rows.length; n++) {
    r = r < 0 ? (step === 1 ? 0 : rows.length - 1) : (r + step + rows.length) % rows.length;
    if (ok(r)) return r;
  }
  return -1;
}

/** Multi-select: one value on / off (order of first choice kept). */
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** "Select all": every enabled option of the (filtered) list added to the choice. */
export function selectAllValues(values: readonly string[], options: readonly ComboOption[], visible: readonly number[]): string[] {
  const add = visible.map((i) => options[i]).filter((o) => !o.disabled).map((o) => o.value);
  return [...new Set([...values, ...add])];
}

/** "Clear": the (filtered) options leave the choice (an empty query clears everything). */
export function clearValues(values: readonly string[], options: readonly ComboOption[], visible: readonly number[], query: string): string[] {
  if (!fold(query)) return [];
  const drop = new Set(visible.map((i) => options[i].value));
  return values.filter((v) => !drop.has(v));
}

/** The rows to draw: all of them for short lists; for long lists only the window around the scroll position. */
export function virtualWindow(total: number, scrollTop: number, opts: { rowPx?: number; viewPx?: number; overscan?: number; from?: number } = {}): { start: number; end: number; padTop: number; padBottom: number; virtual: boolean } {
  const rowPx = opts.rowPx ?? ROW_PX, viewPx = opts.viewPx ?? LIST_PX, overscan = opts.overscan ?? 8, from = opts.from ?? VIRTUAL_FROM;
  if (total <= from) return { start: 0, end: total, padTop: 0, padBottom: 0, virtual: false };
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowPx) - overscan);
  const end = Math.min(total, Math.ceil((Math.max(0, scrollTop) + viewPx) / rowPx) + overscan);
  return { start, end, padTop: start * rowPx, padBottom: (total - end) * rowPx, virtual: true };
}

/** The scroll position that shows row `r` (unchanged when it is already visible). */
export function scrollFor(r: number, scrollTop: number, opts: { rowPx?: number; viewPx?: number } = {}): number {
  const rowPx = opts.rowPx ?? ROW_PX, viewPx = opts.viewPx ?? LIST_PX;
  const top = r * rowPx, bottom = top + rowPx;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewPx) return bottom - viewPx;
  return scrollTop;
}

/** Options from a simple list of { id, name } rows (classes, students, tests …), optionally grouped. */
export const toOptions = <T,>(rows: readonly T[], value: (x: T) => string, label: (x: T) => string, extra?: (x: T) => Partial<ComboOption>): ComboOption[] =>
  rows.map((x) => ({ value: value(x), label: label(x), ...(extra ? extra(x) : {}) }));
