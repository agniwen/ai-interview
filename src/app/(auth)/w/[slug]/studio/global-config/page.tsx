import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import { GlobalConfigForm } from "./_components/global-config-form";

export const metadata: Metadata = {
  title: "全局配置",
};

export default async function StudioGlobalConfigPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const initial = await getGlobalConfig(organizationId);
  return <GlobalConfigForm initial={initial} />;
}
