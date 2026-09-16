import type { FeishuLoginProviderId } from "@/lib/client/feishu-auth-config";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FeishuAccountMigration } from "./feishu-account-migration";
import { useFeishuLoginProviderIds } from "@/lib/client/feishu-auth-config";
import { FeishuSignInButton } from "./feishu-sign-in-button";

export function buildFeishuLoginButtonOptions(providerIds: FeishuLoginProviderId[]) {
  return providerIds.map((providerId) =>
    providerId === "feishu-jiguang-hr"
      ? {
          label: "极光 HR 飞书登录",
          providerId,
          variant: "default" as const,
        }
      : { providerId, variant: "outline" as const },
  );
}

export function isFeishuMigrationEnabled(providerIds: FeishuLoginProviderId[]) {
  return providerIds.includes("feishu");
}

export function FeishuSignInButtonsView({ providerIds }: { providerIds: FeishuLoginProviderId[] }) {
  return buildFeishuLoginButtonOptions(providerIds).map((options) => (
    <FeishuSignInButton key={options.providerId} {...options} />
  ));
}

export function FeishuSignInButtons() {
  const providerIds = useFeishuLoginProviderIds();
  const [migration, setMigration] = useState(false);
  const migrationEnabled = isFeishuMigrationEnabled(providerIds);
  if (migration && migrationEnabled) {
    return <FeishuAccountMigration onBack={() => setMigration(false)} />;
  }
  return (
    <>
      <FeishuSignInButtonsView providerIds={providerIds} />
      {migrationEnabled ? (
        <Button onClick={() => setMigration(true)} variant="ghost">
          已有旧飞书账号？关联极光 HR
        </Button>
      ) : null}
    </>
  );
}
