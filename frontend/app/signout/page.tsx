import type { Metadata } from "next";
import Link from "next/link";
import { Card, Eyebrow } from "@fitai/ui";
import { auth, signOut } from "@/auth";
import { AsyncSubmitButton } from "@/components/AsyncSubmitButton";
import { BrandLockup } from "@/components/BrandLockup";

export const metadata: Metadata = { title: "Sign out — forgefit.space" };

export default async function SignOutPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="system-page">
        <Card className="system-card" padding="lg">
          <BrandLockup />
          <span className="system-status-mark" aria-hidden="true">✓</span>
          <Eyebrow>Session complete</Eyebrow>
          <h1>You&apos;re signed out.</h1>
          <p>Your workout data remains saved to your account. Come back when you&apos;re ready for the next session.</p>
          <div className="system-actions system-actions-single">
            <Link className="system-primary-link" href="/signin">Sign in again</Link>
          </div>
          <Link className="system-home-link" href="/">Back to forgefit.space</Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="system-page">
      <Card className="system-card" padding="lg">
        <BrandLockup />
        <span className="system-status-mark system-status-mark-muted" aria-hidden="true">↗</span>
        <Eyebrow>End this session</Eyebrow>
        <h1>Sign out of forgefit.space?</h1>
        <p>
          You&apos;re signed in as <strong>{session.user.email ?? session.user.name}</strong>.
          Saved plans, workouts, and coach conversations will stay on your account.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signout" });
          }}
        >
          <AsyncSubmitButton
            fullWidth
            label="Sign out securely"
            pendingLabel="Signing out…"
          />
        </form>
        <Link className="system-secondary-link system-cancel-link" href="/">Keep training</Link>
      </Card>
    </main>
  );
}
