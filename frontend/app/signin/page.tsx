import { redirect } from "next/navigation";
import { Button, Card, Eyebrow } from "@fitai/ui";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <span className="auth-mark">F</span>
        <Eyebrow>FitAI Coach</Eyebrow>
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
          <Button type="submit" size="lg" fullWidth>Continue with Google</Button>
        </form>
      </Card>
    </main>
  );
}
