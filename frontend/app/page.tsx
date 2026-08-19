import { redirect } from "next/navigation";
import { auth } from "@/auth";
import FitAICoach from "@/components/FitAICoach";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/signin");

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
