import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/client/auth-client";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { LoginPage } from "@/components/features/login/login-page";
import { Button } from "@/components/ui/button";
import { AuthPageLayout } from "@/components/features/auth/auth-page-layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function McpConnectionsPage() {
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const queryKey = ["mcp-access", "grants", session.data?.user.id];
  const connections = useQuery({
    enabled: Boolean(session.data?.user),
    gcTime: 0,
    queryFn: () => rpcFetch(rpc.api["mcp-access"].grants.$get(), "加载已授权应用失败"),
    queryKey,
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      rpcFetch(rpc.api["mcp-access"].grants[":id"].$delete({ param: { id } }), "撤销失败"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (session.isPending) {
    return (
      <AuthPageLayout backBehavior="history" contentClassName="py-6">
        <output>正在确认登录状态…</output>
      </AuthPageLayout>
    );
  }
  if (!session.data) {
    return <LoginPage backBehavior="history" callbackURL="/mcp/connections" />;
  }
  return (
    <AuthPageLayout backBehavior="history" contentClassName="py-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
            已授权应用
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            管理外部 MCP 客户端的只读访问。撤销后，该连接将无法继续查询或刷新授权。
          </p>
        </div>
        {connections.isPending && <output>正在加载…</output>}
        {connections.error && (
          <p role="alert" className="text-destructive text-sm">
            {connections.error.message}
          </p>
        )}
        {connections.data?.grants.length === 0 && (
          <p className="text-muted-foreground text-sm leading-6">还没有授权应用。</p>
        )}
        {connections.data && connections.data.grants.length > 0 && (
          <div className="flex flex-col">
            <Separator />
            <ScrollArea className="max-h-[min(33rem,calc(100dvh-18rem))]" scrollbars="scroll">
              <ul>
                {connections.data.grants.map((grant) => (
                  <li key={grant.id} className="flex h-44 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 py-4 pr-3">
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className="min-w-0 truncate font-medium"
                          title={grant.clientName ?? "未命名客户端"}
                        >
                          {grant.clientName ?? "未命名客户端"}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(grant.id)}
                        >
                          撤销授权
                        </Button>
                      </div>
                      <p className="truncate text-sm" title={grant.workspaceName}>
                        {grant.workspaceName}
                      </p>
                      <div className="flex flex-col gap-1 text-muted-foreground text-xs">
                        <span>客户端 ID</span>
                        <span className="truncate font-mono" title={grant.clientId}>
                          {grant.clientId}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs leading-5">
                        {grant.scopes
                          .map(
                            (scope) =>
                              ({
                                "candidates:read": "候选人",
                                "jobs:read": "岗位",
                                "reports:read": "面试报告",
                              })[scope] ?? scope,
                          )
                          .join("、")}{" "}
                        · 只读
                      </p>
                    </div>
                    <Separator />
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
        {revoke.error && (
          <p role="alert" className="text-destructive text-sm">
            {revoke.error.message}
          </p>
        )}
        <Link
          to="/"
          className="self-center text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
        >
          返回工作台
        </Link>
      </div>
    </AuthPageLayout>
  );
}
