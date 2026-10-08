import Link from "next/link";

/** A friendly page for a link that leads nowhere. */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200">
        <p className="text-5xl" aria-hidden="true">🧭</p>
        <h1 className="mt-3 text-2xl font-extrabold text-brand-navy">Page not found</h1>
        <p className="mt-2 text-slate-600">This page does not exist or was moved.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">Go home</Link>
      </div>
    </main>
  );
}
