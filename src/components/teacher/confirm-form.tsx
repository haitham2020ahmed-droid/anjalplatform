"use client";

/**
 * A small form button for a server action that asks first ("Cancel this for everyone?"). The labels come translated
 * from the page. Without JavaScript the form still submits (the server checks everything).
 */
export function ConfirmForm({ action, fields, label, ask, tone = "plain" }: {
  action: (f: FormData) => Promise<void>; fields: Record<string, string>; label: string; ask?: string; tone?: "plain" | "danger";
}) {
  return (
    <form action={action} className="inline-flex" onSubmit={(e) => { if (ask && !window.confirm(ask)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-xs font-semibold ring-1 ${tone === "danger" ? "bg-surface text-rose-700 ring-rose-200 hover:bg-rose-50" : "bg-surface text-brand-navy ring-line hover:ring-brand-teal"}`}>{label}</button>
    </form>
  );
}
