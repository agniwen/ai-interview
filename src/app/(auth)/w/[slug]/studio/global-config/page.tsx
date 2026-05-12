import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import { GlobalConfigForm } from "./_components/global-config-form";

export const metadata: Metadata = {
  title: "全局配置",
};

export default async function StudioGlobalConfigPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const initial = await getGlobalConfig(activeOrg.id);
  return <GlobalConfigForm initial={initial} />;
}
