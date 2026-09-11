import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BotStudio } from "@/components/BotStudio";
import { productFlags } from "@/lib/product-flags.server";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const flags = productFlags();
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/signin?callbackUrl=/studio");
  }

  return (
    <BotStudio
      showCareer={flags.showCareer}
      showFitness={flags.showFitness}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
