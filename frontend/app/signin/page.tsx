import { redirect } from "next/navigation";
import { Button, Card, Eyebrow } from "@fitai/ui";
import { auth, signIn } from "@/auth";
import { BrandLockup } from "@/components/BrandLockup";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <BrandLockup />
        <Eyebrow>Adaptive training intelligence</Eyebrow>
        <h1>Build strength. Track everything.</h1>
        <p>
          Adaptive programming, live movement guidance, and an AI coach that
          trains with your real context.
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
