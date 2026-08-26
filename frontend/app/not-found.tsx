import type { Metadata } from "next";
import Link from "next/link";
import { Card, Eyebrow } from "@fitai/ui";
import { BrandLockup } from "@/components/BrandLockup";

export const metadata: Metadata = {
  title: "Page not found — forgefit.space",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="system-page">
      <Card className="system-card not-found-card" padding="lg">
        <BrandLockup />
        <div className="system-code" aria-hidden="true">404</div>
        <Eyebrow>Route not found</Eyebrow>
        <h1>This set isn&apos;t in the plan.</h1>
        <p>
          The page may have moved, or the address may be incomplete. Your training
          data is safe and unchanged.
        </p>
        <div className="system-actions">
          <Link className="system-primary-link" href="/">Return to training</Link>
          <Link className="system-secondary-link" href="/signin">Sign in</Link>
        </div>
      </Card>
    </main>
  );
}
