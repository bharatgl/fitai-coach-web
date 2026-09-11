import { redirect } from "next/navigation";
import { Card, Eyebrow } from "@fitai/ui";
import { auth, signIn } from "@/auth";
import { AsyncSubmitButton } from "@/components/AsyncSubmitButton";
import { BrandLockup } from "@/components/BrandLockup";

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  // Legacy personal products are parked. Old bookmarks continue into the main
  // Agent Studio instead of reopening Fitness or Career.
  if (candidate?.startsWith("/fitness") || candidate?.startsWith("/career") || candidate?.startsWith("/exercises")) {
    return "/studio";
  }
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/studio";
}

function signInErrorMessage(value: string | string[] | undefined) {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return null;
  if (code === "AccessDenied") return "This account was not allowed to sign in. Try a different Google account.";
  if (code === "OAuthCallbackError" || code === "Callback") {
    return "The sign-in connection was interrupted. Nothing was changed—please try again.";
  }
  return "We could not finish secure sign-in. Please try again in a moment.";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.callbackUrl);
  const signInError = signInErrorMessage(params.error);
  let session = null;
  try {
    session = await auth();
  } catch {
    // A cold or interrupted adapter lookup must not strand a visitor on a raw
    // framework error page. The next sign-in attempt will establish a new call.
  }
  if (session) redirect(redirectTo);

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <BrandLockup />
        <span className="auth-orbit" aria-hidden="true"><i /><i /></span>
        <Eyebrow>Unified Agent Studio</Eyebrow>
        <h1>Continue building your agents.</h1>
        <p>
          Configure, test, and operate focused AI agents from one controlled
          workspace.
        </p>
        {signInError && <p className="auth-error" role="alert">{signInError}</p>}
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
        <p className="auth-privacy-note">Secure account access · Review before release</p>
      </Card>
    </main>
  );
}
