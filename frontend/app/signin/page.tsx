import { redirect } from "next/navigation";
import { Card, Eyebrow } from "@fitai/ui";
import { auth, signIn } from "@/auth";
import { AsyncSubmitButton } from "@/components/AsyncSubmitButton";
import { BrandLockup } from "@/components/BrandLockup";

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const redirectTo = safeRedirect((await searchParams).callbackUrl);
  const session = await auth();
  if (session) redirect(redirectTo);

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <BrandLockup />
        <span className="auth-orbit" aria-hidden="true"><i /><i /></span>
        <Eyebrow>Your personal AI specialists</Eyebrow>
        <h1>Welcome back to your space.</h1>
        <p>
          Continue to your fitness coach or build a focused specialist for the
          next goal in front of you.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo });
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
