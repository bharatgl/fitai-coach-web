import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SpecialistWorkspace } from "@/components/SpecialistWorkspace";
import { productFlags } from "@/lib/product-flags.server";

export const dynamic = "force-dynamic";

export default async function SpecialistPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ prompt?: string | string[]; from?: string | string[]; careerSession?: string | string[] }>;
}) {
  const [{ botId }, query, session] = await Promise.all([params, searchParams, auth()]);
  if (!session?.user?.id || !session.user.email) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/studio/bots/${botId}`)}`);
  }
  const requestedPrompt = Array.isArray(query.prompt) ? query.prompt[0] : query.prompt;
  const source = Array.isArray(query.from) ? query.from[0] : query.from;
  const requestedCareerSession = Array.isArray(query.careerSession) ? query.careerSession[0] : query.careerSession;
  const allowCareerEntry = productFlags().showCareer && source === "career";
  return (
    <SpecialistWorkspace
      botId={botId}
      initialPrompt={requestedPrompt?.slice(0, 2_000) ?? ""}
      entry={allowCareerEntry ? "career" : "studio"}
      careerSessionId={allowCareerEntry ? requestedCareerSession?.slice(0, 80) : undefined}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
