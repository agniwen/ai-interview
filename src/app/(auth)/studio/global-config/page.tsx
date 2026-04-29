import type { Metadata } from "next";
import { connection } from "next/server";
import { getGlobalConfig } from "@/server/queries/global-config";
import { GlobalConfigForm } from "./_components/global-config-form";

export const metadata: Metadata = {
  title: "全局配置",
};

export default async function StudioGlobalConfigPage() {
  await connection();
  const initial = await getGlobalConfig();
  return <GlobalConfigForm initial={initial} />;
}
