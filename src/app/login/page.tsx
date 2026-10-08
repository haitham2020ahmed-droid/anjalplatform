import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/** Sign-in page. The form posts to /login/submit (a fixed address that survives deployments). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; u?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm error={sp.error ? String(sp.error).slice(0, 200) : null} username={sp.u ? String(sp.u).slice(0, 100) : ""} next={sp.next ? String(sp.next).slice(0, 300) : ""} />
    </main>
  );
}
