import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import {
  authApiOrigin,
  authClient,
  desktopAppOrigin,
  desktopAuthErrorUrl,
  desktopAuthSuccessUrl,
} from "@/lib/auth-client";

function authorizationLabel(busy: boolean, hasLegacy: boolean | undefined) {
  if (busy) {
    return "处理中…";
  }
  return hasLegacy ? "确认并授权极光 HR" : "第一步：验证旧飞书账号";
}

export function FeishuAccountMigration({ onBack }: { onBack: () => void }) {
  const identity = useQuery({
    gcTime: 0,
    queryFn: async () => {
      const session = await authClient.getSession();
      if (session.error) {
        throw new Error("读取登录状态失败，请重试。");
      }
      if (!session.data) {
        return null;
      }
      const accounts = await authClient.listAccounts();
      if (accounts.error) {
        throw new Error("读取已关联账号失败，请重试。");
      }
      return { accounts: accounts.data ?? [], user: session.data.user };
    },
    queryKey: ["auth", "feishu-migration"],
    staleTime: 0,
  });
  const hasLegacy = identity.data?.accounts.some((item) => item.providerId === "feishu");
  const hasHR = identity.data?.accounts.some((item) => item.providerId === "feishu-jiguang-hr");
  const authorize = useMutation({
    mutationFn: async () => {
      if (identity.data && !hasLegacy) {
        throw new Error("请先退出当前账号，再验证旧飞书账号。");
      }
      const providerId = hasLegacy ? "feishu-jiguang-hr" : "feishu";
      const result = await window.api.auth.openOAuth({
        appOrigin: desktopAppOrigin(),
        authApiOrigin: authApiOrigin(),
        authBaseURL: env.VITE_BETTER_AUTH_URL,
        callbackURL: desktopAuthSuccessUrl(),
        errorCallbackURL: desktopAuthErrorUrl(providerId),
        mode: hasLegacy ? "link" : "sign-in",
        providerId,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      if (result.reason === "closed") {
        return;
      }
      const refreshed = await identity.refetch();
      if (
        !refreshed.data ||
        (hasLegacy &&
          !refreshed.data.accounts.some((item) => item.providerId === "feishu-jiguang-hr"))
      ) {
        throw new Error("授权尚未完成，请重试。原账号和历史数据未改变。");
      }
    },
  });
  const signOut = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) {
        throw new Error("退出登录失败，请重试。");
      }
      await identity.refetch();
    },
  });
  const busy = identity.isFetching || authorize.isPending || signOut.isPending;
  const errorMessage = [identity.error, authorize.error, signOut.error].find(Boolean)?.message;
  return (
    <div className="w-full space-y-3">
      <h2 className="font-medium">旧飞书账号关联极光 HR</h2>
      <p className="text-muted-foreground text-sm">
        先验证原来的极光员工账号，再授权极光 HR。保留原用户、工作区和历史评价表。
      </p>
      {identity.data ? (
        <p className="text-sm">
          当前账号：{identity.data.user.name}（{identity.data.user.email}）
        </p>
      ) : null}
      {hasLegacy && hasHR ? (
        <>
          <p className="text-sm">极光 HR 已关联，后续可直接使用 HR 飞书登录。</p>
          <Button
            className="w-full"
            onClick={() => {
              window.location.hash = "#/";
            }}
          >
            继续进入工作区
          </Button>
        </>
      ) : (
        <Button
          className="w-full"
          disabled={busy || identity.isError || Boolean(identity.data && !hasLegacy)}
          onClick={() => authorize.mutate()}
        >
          {authorizationLabel(busy, hasLegacy)}
        </Button>
      )}
      {identity.data && !hasLegacy ? (
        <>
          <p className="text-sm">当前账号没有旧飞书绑定，请退出后验证原账号。</p>
          <Button disabled={busy} onClick={() => signOut.mutate()} variant="outline">
            退出当前账号
          </Button>
        </>
      ) : null}
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button disabled={busy} onClick={onBack} variant="ghost">
        返回正常登录
      </Button>
    </div>
  );
}
