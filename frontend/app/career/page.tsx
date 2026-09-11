import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CareerProductEntry, CareerReadiness } from "@/components/CareerReadiness";
import { productFlags } from "@/lib/product-flags.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Career Readiness — Make the next move deliberate",
  description: "A private career practice for clear direction, truthful applications, stronger evidence, and realistic interview preparation.",
};

export default async function CareerPage() {
  // Park the legacy product without deleting its route, components, or data.
  if (!productFlags().showCareer) redirect("/");

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return <CareerProductEntry />;

  return (
    <CareerReadiness
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
