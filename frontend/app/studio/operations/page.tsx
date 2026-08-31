import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsDashboard } from "@/components/OperationsDashboard";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/signin?callbackUrl=/studio/operations");
  }

  return (
    <OperationsDashboard
      user={{
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      }}
    />
  );
}
