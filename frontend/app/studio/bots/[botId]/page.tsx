import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SpecialistWorkspace } from "@/components/SpecialistWorkspace";

export const dynamic = "force-dynamic";

export default async function SpecialistPage({ params }: { params: Promise<{ botId: string }> }) {
  const [{ botId }, session] = await Promise.all([params, auth()]);
  if (!session?.user?.id || !session.user.email) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/studio/bots/${botId}`)}`);
  }
  return (
    <SpecialistWorkspace
      botId={botId}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
