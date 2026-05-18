import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import { GlobalConfigForm } from "./_components/global-config-form";

export const metadata: Metadata = {
  title: "系统设置",
};

export default async function StudioGlobalConfigPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const initial = await getGlobalConfig(activeOrg.id);
  return <GlobalConfigForm initial={initial} />;
}
