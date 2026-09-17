import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";

function authorizationLabel(busy: boolean, hasLegacy: boolean | undefined) {
  if (busy) {
    return "处理中…";
  }
  return hasLegacy ? "确认并授权极光 HR" : "第一步：验证旧飞书账号";
}

function migrationError(error: string | undefined) {
  if (error === "account_already_linked_to_different_user") {
    return "该 HR 飞书账号已关联另一个用户，无法自动合并，请联系管理员处理。";
  }
  return error ? "飞书授权未完成，请重试。原账号和历史数据未改变。" : undefined;
}

export function FeishuAccountMigration({
  callbackURL,
  error,
}: {
  callbackURL: string;
  error?: string;
}) {
  const session = authClient.useSession();
  const accounts = useQuery({
    enabled: Boolean(session.data),
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) {
        throw new Error("读取已关联账号失败，请刷新重试。");
      }
      return result.data ?? [];
    },
    queryKey: ["auth", "feishu-migration", session.data?.user.id],
    staleTime: 0,
  });
  const hasLegacy = accounts.data?.some((item) => item.providerId === "feishu");
  const hasHR = accounts.data?.some((item) => item.providerId === "feishu-jiguang-hr");
  const wrongAccount = Boolean(session.data && !hasLegacy);
  const authorize = useMutation({
    mutationFn: async () => {
      const migrationURL = new URL("/login", window.location.origin);
      migrationURL.searchParams.set("feishuMigration", "true");
      migrationURL.searchParams.set("callbackURL", callbackURL);
      const options = {
        callbackURL: migrationURL.toString(),
        errorCallbackURL: migrationURL.toString(),
        provider: hasLegacy ? "feishu-jiguang-hr" : "feishu",
      };
      if (wrongAccount) {
        throw new Error("当前不是旧飞书账号，请先退出当前登录，再验证旧账号。");
      }
      const result = hasLegacy
        ? await authClient.linkSocial(options)
        : await authClient.signIn.social(options);
      if (result.error) {
        throw new Error(result.error.message ?? "飞书授权失败，请重试。");
      }
    },
  });
  const signOut = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) {
        throw new Error("退出登录失败，请重试。");
      }
      await session.refetch();
    },
  });
  const busy =
    session.isPending ||
    (Boolean(session.data) && accounts.isFetching) ||
    authorize.isPending ||
    signOut.isPending;
  const errorMessage =
    [authorize.error, accounts.error, signOut.error].find(Boolean)?.message ??
    migrationError(error);

  return (
    <div className="space-y-3">
      <h2 className="font-medium">旧飞书账号关联极光 HR</h2>
      <p className="text-muted-foreground text-sm">
        先验证原来的极光员工账号，再授权极光 HR。关联后保留原用户、工作区和历史评价表。
      </p>
      {session.data ? (
        <p className="text-sm">
          当前账号：{session.data.user.name}（{session.data.user.email}）
        </p>
      ) : null}
      {hasLegacy && hasHR ? (
        <>
          <p className="text-sm">极光 HR 已关联，后续可直接使用 HR 飞书登录。</p>
          <Button
            className="w-full"
            onClick={() => {
              window.location.assign(callbackURL);
            }}
          >
            继续进入工作区
          </Button>
        </>
      ) : (
        <Button
          className="w-full"
          disabled={busy || accounts.isError || wrongAccount}
          onClick={() => authorize.mutate()}
        >
          {authorizationLabel(busy, hasLegacy)}
        </Button>
      )}
      {wrongAccount && !accounts.isPending && !accounts.isError ? (
        <>
          <p className="text-sm">
            当前账号没有旧飞书绑定。请先退出登录，再使用原来的旧飞书账号验证。
          </p>
          <Button disabled={signOut.isPending} onClick={() => signOut.mutate()} variant="outline">
            退出当前账号
          </Button>
        </>
      ) : null}
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Link
        className="text-muted-foreground text-sm underline"
        search={{ callbackURL }}
        to="/login"
      >
        返回正常登录
      </Link>
    </div>
  );
}
