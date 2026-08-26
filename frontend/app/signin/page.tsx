import { redirect } from "next/navigation";
import { Card, Eyebrow } from "@fitai/ui";
import { auth, signIn } from "@/auth";
import { AsyncSubmitButton } from "@/components/AsyncSubmitButton";
import { BrandLockup } from "@/components/BrandLockup";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <BrandLockup />
        <span className="auth-orbit" aria-hidden="true"><i /><i /></span>
        <Eyebrow>Adaptive training intelligence</Eyebrow>
        <h1>Welcome back to your training.</h1>
        <p>
          Continue to your plan, workout history, and coach—exactly where you
          left them.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <AsyncSubmitButton
            size="lg"
            fullWidth
            label="Continue with Google"
            pendingLabel="Opening secure sign in…"
          />
        </form>
        <p className="auth-privacy-note">Secure account access · Camera tracking stays on your device</p>
      </Card>
    </main>
  );
}
