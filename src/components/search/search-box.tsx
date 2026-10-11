/** 🔎 The big search box (a plain GET form: works without JavaScript, and the result page has its own address). */
export function SearchBox({ q = "", autoFocus = false, big = true }: { q?: string; autoFocus?: boolean; big?: boolean }) {
  return (
    <form action="/teacher/search" method="get" role="search" className={`flex items-center gap-3 rounded-2xl bg-white shadow-sm ring-2 ring-brand-teal/40 focus-within:ring-brand-teal ${big ? "px-5 py-3.5" : "px-4 py-2.5"}`}>
      <span aria-hidden="true" className={big ? "text-2xl" : "text-xl"}>🔎</span>
      <label htmlFor="site-search" className="sr-only">Search the platform</label>
      <input id="site-search" name="q" type="search" defaultValue={q} autoFocus={autoFocus} autoComplete="off" placeholder="Search anything — a skill, grammar lesson, standard (RL.4.2), unit, article, question, student or page" className={`w-full bg-transparent outline-none placeholder:text-slate-400 ${big ? "text-lg" : ""}`} />
      <button className="shrink-0 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Search</button>
    </form>
  );
}
