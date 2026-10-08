"use client";
/** ☑ Ticks (or clears) every checkbox named `name` inside the element with id `scope`. */
export function SelectAll({ scope, name = "codes", label = "Select all", className = "" }: { scope: string; name?: string; label?: string; className?: string }) {
  const toggle = () => {
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(`#${CSS.escape(scope)} input[type=checkbox][name="${name}"]`));
    const on = boxes.some((b) => !b.checked);
    for (const b of boxes) b.checked = on;
  };
  return <button type="button" onClick={toggle} className={`rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-brand-navy ring-1 ring-slate-300 transition hover:ring-brand-teal active:scale-95 ${className}`}>☑ {label}</button>;
}
