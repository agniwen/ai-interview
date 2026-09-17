import type { FeishuLoginProviderId } from "@/lib/client/feishu-auth-config";
import { Link } from "@tanstack/react-router";
import { useFeishuLoginProviderIds } from "@/lib/client/feishu-auth-config";
import * as messages from "@/paraglide/messages";
import { FeishuSignInButton } from "./feishu-sign-in-button";

export function buildFeishuLoginButtonOptions(providerIds: FeishuLoginProviderId[]) {
  return providerIds.map((providerId) =>
    providerId === "feishu-jiguang-hr"
      ? {
          label: messages.login_jiguang_hr_feishu(),
          providerId,
          variant: "default" as const,
        }
      : { providerId, variant: "outline" as const },
  );
}

export function isFeishuMigrationEnabled(providerIds: FeishuLoginProviderId[]) {
  return providerIds.includes("feishu");
}

export function FeishuSignInButtonsView({
  callbackURL,
  providerIds,
}: {
  callbackURL: string;
  providerIds: FeishuLoginProviderId[];
}) {
  return buildFeishuLoginButtonOptions(providerIds).map((options) => (
    <FeishuSignInButton callbackURL={callbackURL} key={options.providerId} {...options} />
  ));
}

export function FeishuSignInButtons({ callbackURL }: { callbackURL: string }) {
  const providerIds = useFeishuLoginProviderIds();
  return (
    <>
      <FeishuSignInButtonsView callbackURL={callbackURL} providerIds={providerIds} />
      {isFeishuMigrationEnabled(providerIds) ? (
        <Link
          className="block text-center text-muted-foreground text-sm underline"
          search={{ callbackURL, feishuMigration: true }}
          to="/login"
        >
          已有旧飞书账号？关联极光 HR
        </Link>
      ) : null}
    </>
  );
}
