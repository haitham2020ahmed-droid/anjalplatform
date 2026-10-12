/**
 * 📝 "Write or paste my rubric": the teacher's own rubric text → the platform's rubric structure (pure, no imports, so
 * the task form can show a live preview with the very same parser the server uses).
 *
 * Two formats:
 *   1. A table pasted from Word / Excel / Google Docs (tab-separated; Excel's quoted cells with line breaks work):
 *        first row    = level headers with their points: "Exemplary (4)" · "4 - Exemplary" · "Exemplary 4 pts" · "4"
 *        first column = the criterion, optional description in parentheses: "Ideas (A clear opinion with reasons)"
 *        cells        = the level descriptions
 *   2. Simple typed text (a blank line between criteria):
 *        Ideas: A clear opinion with reasons
 *        4 Exemplary - strong opinion, well-explained reasons
 *        3 Proficient - opinion with two reasons
 *        Developing (2): one reason
 *      An optional first line "Title: …" names the rubric.
 *
 * Levels are ordered low → high by points. Errors name the line (or the table row/column) and show an example.
 * The server still runs the result through cleanRubric (src/server/writing/locked.ts) before saving.
 */

export interface TextLevel { label: string; points: number; description: string }
export interface TextCriterion { title: string; description: string; levels: TextLevel[] }
export interface RubricTextIssue {
  /** 1-based line of the text (lines format) or row of the table; null = the whole text */
  line: number | null;
  /** the English template (translated on the page: t(key, vars)) */
  key: string;
  vars: Record<string, string | number>;
  /** the English message, ready to show */
  message: string;
}
export interface RubricTextResult {
  format: "table" | "lines" | null;
  title: string;
  criteria: TextCriterion[];
  errors: RubricTextIssue[];
}

export const RUBRIC_TEXT_MAX = 20000;
const MAX_CRITERIA = 10, MIN_LEVELS = 2, MAX_LEVELS = 6;

const fill = (key: string, vars: Record<string, string | number>) => key.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const issue = (line: number | null, key: string, vars: Record<string, string | number> = {}): RubricTextIssue => ({ line, key, vars, message: fill(key, vars) });
const clean = (v: string, max: number) => v.replace(/[ \s]+/g, " ").trim().slice(0, max);
const BULLET = /^\s*(?:[-*•·▪◦–—]|\d{1,2}[.)](?=\s+\D))\s+/;
const QUOTES = /^["“”']+|["“”']+$/g;

/** "Ideas (A clear opinion)" · "Ideas: A clear opinion" · "Ideas - A clear opinion" → title + description. */
function splitTitle(raw: string): { title: string; description: string } {
  const v = clean(raw.replace(BULLET, ""), 700).replace(QUOTES, "").trim();
  const paren = v.match(/^([^()]+?)\s*\((.+)\)\s*$/);
  if (paren) return { title: clean(paren[1], 120), description: clean(paren[2], 500) };
  const sep = v.match(/^(.+?)\s*(?::|\s[-–—]\s)\s*(.*)$/);
  if (sep) return { title: clean(sep[1], 120), description: clean(sep[2], 500) };
  return { title: clean(v.replace(/:$/, ""), 120), description: "" };
}

/**
 * The points in a level header or a level name: "Exemplary (4)", "4 - Exemplary", "Exemplary 4 pts", "4 points",
 * "Level 4: Exemplary". Returns null when there is no number. A decimal (3.5) is returned as is (rejected later).
 */
export function pointsIn(raw: string): { points: number; label: string } | null {
  const v = clean(raw, 200);
  const tries: RegExp[] = [
    /(\d+(?:[.,]\d+)?)\s*(?:pts?|points?|marks?)\b\.?/i, // 4 pts
    /\(\s*(\d+(?:[.,]\d+)?)\s*\)/, // (4)
    /^(\d+(?:[.,]\d+)?)(?=\s|[-–—:.)=]|$)/, // 4 - Exemplary
    /(?:^|\s|[-–—:=])(\d+(?:[.,]\d+)?)\s*$/, // Exemplary 4 · Exemplary = 4
    /(\d+(?:[.,]\d+)?)/, // anywhere
  ];
  for (const re of tries) {
    const m = v.match(re);
    if (!m) continue;
    const points = Number(m[1].replace(",", "."));
    let label = clean(v.replace(m[0], " ").replace(/\(\s*\)/g, " ").replace(/^[\s\-–—:.)=|/]+|[\s\-–—:(=|/]+$/g, ""), 60);
    if (!label || /^level$/i.test(label)) label = v.replace(/[()]/g, "").trim().slice(0, 60);
    return { points, label };
  }
  return null;
}

const badPoints = (p: number) => !Number.isInteger(p) || p < 0 || p > 100;

// ------------------------------------------------------------------ the table (tab-separated)

/** Tab-separated rows; a cell that starts with a double quote may hold tabs, line breaks and "" (Excel's copy). */
export function splitTsv(text: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], cell = "", i = 0, line = 1, rowLine = 1, quoted = false, atStart = true;
  const endCell = () => { cells.push(cell); cell = ""; atStart = true; };
  const endRow = () => { endCell(); rows.push({ cells, line: rowLine }); cells = []; rowLine = line; };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && atStart) { quoted = true; atStart = false; i++; continue; }
    if (ch === "\t") { endCell(); i++; continue; }
    if (ch === "\n") { line++; endRow(); i++; continue; }
    cell += ch; atStart = false; i++;
  }
  if (cell || cells.length) endRow();
  return rows.filter((r) => r.cells.some((c) => c.trim()));
}

function parseTable(text: string): RubricTextResult {
  const errors: RubricTextIssue[] = [];
  const rows = splitTsv(text);
  let title = "";
  // an optional title row: a single filled cell before the header row
  if (rows.length > 1 && rows[0].cells.filter((c) => c.trim()).length === 1 && rows[1].cells.filter((c) => c.trim()).length > 2) {
    title = clean(rows[0].cells.find((c) => c.trim())!.replace(/^(?:rubric\s*title|rubric|title)\s*:\s*/i, ""), 120);
    rows.shift();
  }
  const [head, ...body] = rows;
  if (!head) return { format: "table", title, criteria: [], errors: [issue(null, "Paste a table or type your rubric first.")] };
  // the header: the level columns (the first cell is the criteria column: often empty or "Criteria")
  const cols: { col: number; points: number; label: string }[] = [];
  head.cells.forEach((c, col) => {
    if (col === 0 || !c.trim()) return;
    const p = pointsIn(c);
    if (!p) { errors.push(issue(head.line, "Row {line}: the level header “{text}” needs points, e.g. “Exemplary (4)” or “4 - Exemplary”.", { line: head.line, text: clean(c, 40) })); return; }
    if (badPoints(p.points)) { errors.push(issue(head.line, "Row {line}: “{text}”: points must be a whole number from 0 to 100.", { line: head.line, text: clean(c, 40) })); return; }
    cols.push({ col, points: p.points, label: p.label });
  });
  if (!errors.length && cols.length < MIN_LEVELS) errors.push(issue(head.line, "Row {line}: the first row needs 2 to 6 level headers with points, e.g. “Beginning (1)”, “Developing (2)”…", { line: head.line }));
  if (cols.length > MAX_LEVELS) errors.push(issue(head.line, "Row {line}: a rubric has 2 to 6 levels (this one has {n}).", { line: head.line, n: cols.length }));
  const order = [...cols].sort((a, b) => a.points - b.points);
  const criteria: TextCriterion[] = [];
  for (const r of body) {
    const name = r.cells[0] ?? "";
    const extra = r.cells.slice(1).some((c, k) => c.trim() && !(head.cells[k + 1] ?? "").trim());
    if (!name.trim()) { errors.push(issue(r.line, "Row {line}: write the criterion's name in the first column.", { line: r.line })); continue; }
    if (extra) errors.push(issue(r.line, "Row {line}: there is text in a column without a level header.", { line: r.line }));
    const [first, ...more] = name.split("\n");
    const named = splitTitle(first), ct = named.title, description = clean([named.description, ...more].join(" "), 500);
    if (ct.length < 2) { errors.push(issue(r.line, "Row {line}: write the criterion's name in the first column.", { line: r.line })); continue; }
    criteria.push({ title: ct, description, levels: order.map((x) => ({ label: x.label, points: x.points, description: clean(r.cells[x.col] ?? "", 500) })) });
  }
  if (!body.length) errors.push(issue(null, "Add a row for each criterion under the level headers."));
  return finish({ format: "table", title, criteria, errors });
}

// ------------------------------------------------------------------ the typed lines

/** A level line: "4 Exemplary - …", "4 - Exemplary: …", "Exemplary (4): …", "Exemplary 4 pts - …", "- 3. Proficient – …". */
function parseLevel(raw: string, line: number): { level?: TextLevel; error?: RubricTextIssue } {
  const v = clean(raw.replace(/^\s*[-*•·▪◦]\s+/, ""), 800);
  const example = { line };
  // leading points: "4 Exemplary - text", "4 - Exemplary: text", "4) Exemplary – text", "4 pts Exemplary: text"
  const lead = v.match(/^(\d+(?:[.,]\d+)?)(?=[\s.)\]:=\-–—]|pts?\b|points?\b|marks?\b|$)\s*(?:pts?|points?|marks?)?\s*[.)\]:=]?\s*(?:[-–—]\s*)?(.*)$/i);
  let points: number | null = null, rest = v;
  if (lead) { points = Number(lead[1].replace(",", ".")); rest = lead[2]; }
  let label = "", description = "";
  const sep = rest.match(/^(.+?)\s*(?::|\s[-–—]\s|[-–—]\s)\s*(.*)$/);
  if (points !== null) {
    if (sep) { label = sep[1]; description = sep[2]; }
    else if (rest.split(/\s+/).length <= 3) label = rest;
    else return { error: issue(line, "Line {line}: separate the level name from its description with “-” or “:”, e.g. 3 Proficient - opinion with two reasons.", example) };
  } else {
    // the points are in the name part: "Exemplary (4): text", "Exemplary 4 pts - text", or at the end: "Exemplary - text (4 pts)"
    const head = sep ? sep[1] : rest;
    const p = pointsIn(head);
    const tail = !p && sep ? sep[2].match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?|marks?)?\s*\)\s*$/i) : null;
    if (p) { points = p.points; label = p.label; description = sep ? sep[2] : ""; }
    else if (tail && sep) { points = Number(tail[1].replace(",", ".")); label = sep[1]; description = sep[2].slice(0, tail.index).trim(); }
    else return { error: issue(line, "Line {line}: a level needs points, e.g. 3 Proficient - opinion with two reasons.", example) };
  }
  if (badPoints(points)) return { error: issue(line, "Line {line}: points must be a whole number from 0 to 100.", example) };
  label = clean(label.replace(QUOTES, ""), 60);
  if (!label) return { error: issue(line, "Line {line}: the level needs a name, e.g. 3 Proficient - opinion with two reasons.", example) };
  return { level: { label, points, description: clean(description, 500) } };
}

const looksLikeLevel = (raw: string) => {
  const v = raw.replace(/^\s*[-*•·▪◦]\s+/, "").trim();
  return /^\d/.test(v) || /^[^:–—-]{1,60}?(?:\(\s*\d+\s*(?:pts?|points?|marks?)?\s*\)|\d+\s*(?:pts?|points?|marks?)\b)/i.test(v);
};

function parseLines(text: string): RubricTextResult {
  const errors: RubricTextIssue[] = [];
  const lines = text.split("\n");
  let title = "";
  type Cur = TextCriterion & { line: number; bad: number };
  const criteria: Cur[] = [];
  let cur: Cur | null = null, blank = true;
  lines.forEach((raw, k) => {
    const line = k + 1, v = raw.trim();
    if (!v) { blank = true; return; }
    const tm = v.match(/^(?:rubric\s*title|rubric|title)\s*:\s*(.+)$/i);
    if (tm && !criteria.length && !title) { title = clean(tm[1], 120); blank = true; return; }
    // a new criterion: the first line after a blank line, or a "Name:" line once the current criterion has its levels
    const startsNew = !cur || (blank && !looksLikeLevel(v)) || (!looksLikeLevel(v) && cur.levels.length >= MIN_LEVELS && /^[^:]{2,80}:/.test(v.replace(BULLET, "")));
    blank = false;
    if (startsNew && !looksLikeLevel(v)) {
      const { title: ct, description } = splitTitle(v);
      cur = { title: ct, description, levels: [], line, bad: 0 };
      criteria.push(cur);
      if (ct.length < 2) errors.push(issue(line, "Line {line}: write the criterion's name, e.g. Ideas: A clear opinion with reasons.", { line }));
      return;
    }
    if (!cur) { errors.push(issue(line, "Line {line}: start with the criterion's name, e.g. Ideas: A clear opinion with reasons.", { line })); return; }
    const r = parseLevel(v, line);
    if (r.error) { errors.push(r.error); cur.bad++; }
    else cur.levels.push(r.level!);
  });
  for (const c of criteria) {
    if (c.bad) { /* its lines already have their own errors */ }
    else if (c.levels.length && (c.levels.length < MIN_LEVELS || c.levels.length > MAX_LEVELS)) errors.push(issue(c.line, "Line {line}: “{name}” needs 2 to 6 levels (it has {n}).", { line: c.line, name: c.title, n: c.levels.length }));
    else if (!c.levels.length) errors.push(issue(c.line, "Line {line}: “{name}” has no levels. Under it, write one level per line, e.g. 3 Proficient - opinion with two reasons.", { line: c.line, name: c.title }));
    c.levels.sort((a, b) => a.points - b.points);
  }
  return finish({ format: "lines", title, criteria: criteria.map((c) => ({ title: c.title, description: c.description, levels: c.levels })), errors });
}

function finish(r: RubricTextResult): RubricTextResult {
  if (r.criteria.length > MAX_CRITERIA) r.errors.push(issue(null, "A rubric has at most 10 criteria (this one has {n}).", { n: r.criteria.length }));
  if (!r.errors.length && r.criteria.length && r.criteria.every((c) => c.levels.every((l) => l.points <= 0))) r.errors.push(issue(null, "The rubric needs at least one level worth more than 0 points."));
  const seen = new Set<string>();
  for (const c of r.criteria) {
    const k = c.title.toLowerCase();
    if (seen.has(k)) r.errors.push(issue(null, "Two criteria are both called “{name}”.", { name: c.title }));
    seen.add(k);
  }
  r.errors.sort((a, b) => (a.line ?? 1e9) - (b.line ?? 1e9));
  return r;
}

/** The teacher's rubric text → { title, criteria (levels low → high), errors }. Never throws. */
export function parseRubricText(input: unknown): RubricTextResult {
  const text = String(input ?? "").slice(0, RUBRIC_TEXT_MAX).replace(/\r\n?/g, "\n").replace(/​|﻿/g, "");
  if (!text.trim()) return { format: null, title: "", criteria: [], errors: [issue(null, "Paste a table or type your rubric first.")] };
  // a table copied from Word / Excel / Google Docs keeps its cells apart with tabs
  const tabbed = text.split("\n").filter((l) => l.includes("\t")).length;
  return tabbed >= 1 && tabbed >= Math.min(2, text.split("\n").filter((l) => l.trim()).length) ? parseTable(text) : parseLines(text);
}
