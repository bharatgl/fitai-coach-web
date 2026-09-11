import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import FitAICoach from "@/components/FitAICoach";
import { FitAIEntry } from "@/components/FitAIEntry";
import { productFlags } from "@/lib/product-flags.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FitAI Coach — Train with intent",
  description: "Adaptive training grounded in readiness, completed work, honest effort, and private on-device movement signals.",
};

export default async function FitnessPage() {
  // Park the legacy product without deleting its route, components, or data.
  if (!productFlags().showFitness) redirect("/");

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return <FitAIEntry />;

  return (
    <FitAICoach
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
