import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getJoinPreview } from "@/server/routes/join/dao";
import { InvalidJoinLink } from "./_components/invalid-join-link";
import { JoinClient } from "./_components/join-client";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  if (!/^[0-9A-Za-z]{16}$/u.test(code)) {
    return <InvalidJoinLink />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  const preview = await getJoinPreview({ code, userId });

  if (!preview.valid || !preview.workspace) {
    return <InvalidJoinLink />;
  }

  if (!userId) {
    redirect(`/login?returnTo=${encodeURIComponent(`/join/${code}`)}`);
  }

  if (preview.alreadyMember) {
    await auth.api.setActiveOrganization({
      body: { organizationId: preview.workspace.id },
      headers: await headers(),
    });
    redirect("/?goto=chat");
  }

  return <JoinClient code={code} workspace={preview.workspace} />;
}
