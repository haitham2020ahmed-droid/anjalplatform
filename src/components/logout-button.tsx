/** Logout is a POST form (never a GET link), so other sites cannot sign users out. */
export function LogoutButton() {
  return (
    <form action="/logout" method="post">
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">Sign out</button>
    </form>
  );
}
