import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BotStudio } from "@/components/BotStudio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/signin?callbackUrl=/studio");
  }

  return (
    <BotStudio
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
