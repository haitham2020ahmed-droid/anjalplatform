"use client";
/**
 * 🔎 Combo — the platform's ONE picker (skills, standards, students, classes, lessons, articles, questions, booklets,
 * words …). The rule: clicking or focusing it opens the FULL list immediately (grouped, scrollable) and typing filters
 * it live — never an empty box where the user must type first.
 *
 *   single  <Combo name="classId" defaultValue={id} options={…} label={t("Class")} />           (a form field)
 *           <Combo value={v} onChange={setV} options={…} />                                       (controlled)
 *   multi   <Combo multiple name="sid" defaultValue={ids} options={…} />  chips + "Select all" / "Clear"
 *
 * Accessible (WAI-ARIA combobox + listbox: ↑ ↓ Home End Enter Escape Tab, Backspace removes the last chip, the active
 * option is announced), RTL-safe (logical sides only), mobile-friendly (44 px rows, 16 px text so phones do not zoom),
 * fast (the options come already loaded from the server; lists over 300 rows are virtualised). In a form the choice
 * goes as hidden input(s) named `name`; `submitOnChange` submits the form after a choice (filter bars).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { buildRows, clearValues, filterOptions, LIST_PX, moveActive, ROW_PX, scrollFor, selectAllValues, toggleValue, virtualWindow, type ComboOption } from "@/lib/combo";

export type { ComboOption } from "@/lib/combo";

interface Common {
  options: readonly ComboOption[];
  /** the accessible name (the visible <label> text, usually) */
  label?: string;
  id?: string;
  /** the form field: one hidden input (single) or one per chosen value (multiple) */
  name?: string;
  /** the id of the form the hidden inputs belong to (when the picker sits outside it) */
  form?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** submit the surrounding form after each choice (GET filter bars) */
  submitOnChange?: boolean;
  /** the input's text direction (codes and English names: "ltr") */
  dir?: "ltr" | "rtl" | "auto";
  /** the picker's own search rule (default: every typed word appears in the label, hint, group or keywords) */
  match?: (option: ComboOption, query: string) => boolean;
}
interface Single extends Common { multiple?: false; value?: string; defaultValue?: string; onChange?: (value: string) => void }
interface Multi extends Common { multiple: true; value?: string[]; defaultValue?: string[]; onChange?: (values: string[]) => void; /** offer "Select all" (default true) */ selectAll?: boolean }
export type ComboProps = Single | Multi;

const INPUT = "min-h-11 w-full min-w-0 flex-1 bg-transparent px-2 text-base text-ink outline-none placeholder:text-muted sm:text-sm";

export function Combo(props: ComboProps) {
  const t = useT();
  const uid = useId();
  const id = props.id ?? `combo-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const listId = `${id}-list`;
  const multiple = props.multiple === true;
  const { options } = props;

  const initial = multiple ? ((props as Multi).value ?? (props as Multi).defaultValue ?? []) : [((props as Single).value ?? (props as Single).defaultValue ?? "")];
  const [inner, setInner] = useState<string[]>(initial.filter((v) => v !== undefined));
  const controlled = props.value !== undefined;
  const values: string[] = controlled ? (multiple ? ((props as Multi).value ?? []) : [((props as Single).value ?? "")]) : inner;
  const single = multiple ? "" : values[0] ?? "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const submitAfter = useRef(false);

  const visible = useMemo(() => filterOptions(options, query, props.match), [options, query, props.match]);
  const rows = useMemo(() => buildRows(options, visible), [options, visible]);
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const win = virtualWindow(rows.length, scrollTop);

  // a filter bar: submit once the new hidden value is in the DOM
  useEffect(() => {
    if (!submitAfter.current) return;
    submitAfter.current = false;
    const f = input.current?.form ?? (props.form ? (document.getElementById(props.form) as HTMLFormElement | null) : null);
    f?.requestSubmit();
  });

  const commit = (next: string[]) => {
    if (!controlled) setInner(next);
    if (multiple) (props as Multi).onChange?.(next);
    else (props as Single).onChange?.(next[0] ?? "");
    if (props.submitOnChange) submitAfter.current = true;
  };
  const show = (r: number) => {
    setActive(r);
    if (r < 0 || !list.current) return;
    const top = scrollFor(r, list.current.scrollTop, { rowPx: ROW_PX, viewPx: LIST_PX });
    if (top !== list.current.scrollTop) { list.current.scrollTop = top; setScrollTop(top); }
  };
  const openList = () => {
    if (props.disabled) return;
    setOpen(true);
    setQuery("");
    // the full list, the current choice active (or the first option)
    requestAnimationFrame(() => {
      const all = buildRows(options, filterOptions(options, ""));
      const at = !multiple && single ? all.findIndex((r) => r.kind === "option" && options[r.index].value === single) : -1;
      const r = at >= 0 ? at : moveActive(all, options, -1, "first");
      setActive(r);
      if (list.current) { const top = Math.max(0, r * ROW_PX - LIST_PX / 2); list.current.scrollTop = top; setScrollTop(top); }
    });
  };
  const close = () => { setOpen(false); setQuery(""); setActive(-1); };
  const choose = (o: ComboOption | undefined) => {
    if (!o || o.disabled) return;
    if (multiple) { commit(toggleValue(values, o.value)); return; }
    commit([o.value]);
    close();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { openList(); return; }
      show(moveActive(rows, options, active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" && open) { e.preventDefault(); show(moveActive(rows, options, -1, "first")); }
    else if (e.key === "End" && open) { e.preventDefault(); show(moveActive(rows, options, -1, "last")); }
    else if (e.key === "Enter") {
      if (open) { e.preventDefault(); const r = rows[active]; if (r?.kind === "option") choose(options[r.index]); }
    } else if (e.key === "Escape") { if (open) { e.preventDefault(); close(); } }
    else if (e.key === "Tab") close();
    else if (e.key === "Backspace" && multiple && !query && values.length) commit(values.slice(0, -1));
  };

  const chosenLabel = !multiple && single ? byValue.get(single)?.label ?? "" : "";
  const placeholder = props.placeholder ?? (multiple ? (values.length ? t("{n} selected", { n: values.length }) : t("Search or choose…")) : t("Search or choose…"));
  const activeId = active >= 0 && rows[active]?.kind === "option" ? `${id}-o${active}` : undefined;

  return (
    <div ref={wrap} className={`relative min-w-0 ${props.className ?? ""}`} data-combo=""
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) close(); }}>
      {/* the form value(s) */}
      {props.name && (multiple ? values.map((v) => <input key={v} type="hidden" name={props.name} value={v} form={props.form} />) : <input type="hidden" name={props.name} value={single} form={props.form} />)}
      {props.required && <input tabIndex={-1} aria-hidden="true" required value={multiple ? values.join(",") : single} onChange={() => {}} onFocus={() => input.current?.focus()} className="pointer-events-none absolute bottom-0 start-4 h-px w-px opacity-0" />}
      <div className={`flex min-h-11 flex-wrap items-center gap-1 rounded-xl bg-surface px-1 ring-1 ${open ? "ring-2 ring-teal-600" : "ring-line"} ${props.disabled ? "opacity-50" : ""}`}
        onMouseDown={(e) => { if (e.target !== input.current) { e.preventDefault(); input.current?.focus(); if (!open) openList(); } }}>
        {multiple && values.map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 py-0.5 ps-2.5 pe-1 text-xs font-semibold text-teal-900 ring-1 ring-teal-200">
            <bdi className="min-w-0 truncate" dir="auto">{byValue.get(v)?.label ?? v}</bdi>
            <button type="button" tabIndex={-1} aria-label={t("Remove {name}", { name: byValue.get(v)?.label ?? v })} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(values.filter((x) => x !== v))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-teal-100">✕</button>
          </span>
        ))}
        <input ref={input} id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
          aria-activedescendant={open ? activeId : undefined} aria-label={props.label} autoComplete="off" spellCheck={false} disabled={props.disabled} dir={props.dir}
          value={open ? query : chosenLabel} placeholder={open && chosenLabel ? chosenLabel : placeholder}
          onFocus={() => { if (!open) openList(); }} onClick={() => { if (!open) openList(); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); const nr = buildRows(options, filterOptions(options, e.target.value, props.match)); setActive(moveActive(nr, options, -1, "first")); if (list.current) { list.current.scrollTop = 0; setScrollTop(0); } }}
          onKeyDown={onKey} className={INPUT} />
        <span aria-hidden="true" className="pointer-events-none pe-2 text-xs text-muted">▾</span>
      </div>
      {open && (
        // (inside a <label>, a click in the list must not "activate" the label: that would reopen the list)
        <div className="absolute inset-x-0 z-40 mt-1 overflow-hidden rounded-xl bg-surface shadow-lg ring-1 ring-line" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
          {multiple && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 text-xs">
              {(props as Multi).selectAll !== false && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(selectAllValues(values, options, visible))} className="min-h-9 rounded-lg px-2 font-semibold text-teal-ink ring-1 ring-line">{t("Select all")}{query ? ` (${visible.length})` : ""}</button>}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(clearValues(values, options, visible, query))} className="min-h-9 rounded-lg px-2 font-semibold text-ink-2 ring-1 ring-line">{t("Clear")}</button>
              <span className="ms-auto text-muted" aria-live="polite">{t("{n} selected", { n: values.length })}</span>
            </div>
          )}
          <div ref={list} id={listId} role="listbox" aria-label={props.label} aria-multiselectable={multiple || undefined} tabIndex={-1}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto overscroll-contain py-1" style={{ maxHeight: LIST_PX }}>
            {!rows.length && <p className="px-3 py-3 text-sm text-muted" role="presentation">{t("No matches.")}</p>}
            {win.padTop > 0 && <div style={{ height: win.padTop }} aria-hidden="true" />}
            {rows.slice(win.start, win.end).map((r, k) => {
              const at = win.start + k;
              if (r.kind === "group") return <div key={`g${at}`} role="presentation" className="flex items-end px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted" style={{ height: ROW_PX }}>{r.label}</div>;
              const o = options[r.index];
              const on = values.includes(o.value);
              return (
                <div key={`o${at}:${o.value}`} id={`${id}-o${at}`} role="option" aria-selected={on} aria-disabled={o.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => { if (active !== at && !o.disabled) setActive(at); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 text-sm ${at === active ? "bg-teal-50" : ""} ${o.disabled ? "cursor-not-allowed text-muted" : "text-ink"}`} style={{ height: ROW_PX }}>
                  {multiple ? <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded ring-1 ${on ? "bg-teal-700 text-white ring-teal-700" : "ring-line"}`}>{on ? "✓" : ""}</span>
                    : <span aria-hidden="true" className="w-4 shrink-0 text-teal-700">{on ? "✓" : ""}</span>}
                  <bdi dir="auto" className="min-w-0 flex-1 truncate">{o.label}</bdi>
                  {o.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted" dir="auto">{o.hint}</span>}
                </div>
              );
            })}
            {win.padBottom > 0 && <div style={{ height: win.padBottom }} aria-hidden="true" />}
          </div>
        </div>
      )}
    </div>
  );
}
