import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="auth-mark">F</span>
        <p className="label">FITAI COACH</p>
        <h1>Train with clarity.</h1>
        <p>
          Sign in to keep your profile, plans, sessions, and coaching history
          private and synchronized.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="primary" type="submit">
            Continue with Google →
          </button>
        </form>
      </section>
    </main>
  );
}
