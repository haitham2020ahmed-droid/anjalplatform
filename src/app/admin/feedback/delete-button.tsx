"use client";

/** The "Delete" button on one feedback note: a plain browser confirm, then the server action. No client state. */
export function DeleteFeedbackForm({ action, id, label, confirmText }: { action: (f: FormData) => Promise<void>; id: string; label: string; confirmText: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(confirmText)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">{label}</button>
    </form>
  );
}
