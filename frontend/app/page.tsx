import { auth } from "@/auth";
import FitAICoach from "@/components/FitAICoach";
import LandingPage from "@/components/LandingPage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return <LandingPage />;

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
