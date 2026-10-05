/** @jsxRuntime automatic */
/** @jsxImportSource react */
/** Horizontal bars with values written on them (no axis reading needed). */
export function BarList({ items, max, color = "bg-brand-teal", suffix = "" }: { items: { label: string; value: number }[]; max?: number; color?: string; suffix?: string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[8rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-slate-700">{i.label}</span>
          <span className="h-3 rounded-full bg-slate-100"><span className={["block h-3 rounded-full", color].join(" ")} style={{ width: `${Math.max(i.value > 0 ? 3 : 0, (100 * i.value) / m)}%` }} /></span>
          <span className="text-right tabular-nums text-slate-700">{i.value}{suffix}</span>
        </li>
      ))}
    </ul>
  );
}
