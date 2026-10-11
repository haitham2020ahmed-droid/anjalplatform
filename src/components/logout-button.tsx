/** Logout is a POST form (never a GET link), so other sites cannot sign users out. */
export function LogoutButton({ label = "Sign out" }: { label?: string }) {
  return (
    <form action="/logout" method="post">
      <button className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100">{label}</button>
    </form>
  );
}
