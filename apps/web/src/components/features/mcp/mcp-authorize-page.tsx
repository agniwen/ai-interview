import { Link } from "@tanstack/react-router";
import { AuthPageLayout } from "@/components/features/auth/auth-page-layout";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/client/auth-client";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { LoginPage } from "@/components/features/login/login-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const scopeLabels = {
  "candidates:read": "读取候选人及简历资料",
  "jobs:read": "读取岗位与岗位 JD",
  "reports:read": "读取面试报告",
} as const;
type Scope = keyof typeof scopeLabels;

function McpConsentForm({
  oauthQuery,
  user,
}: {
  oauthQuery: string;
  user: { id: string; name: string };
}) {
  const params = new URLSearchParams(oauthQuery);
  const clientId = params.get("client_id") ?? "";
  const requestedScopes = new Set((params.get("scope") ?? "").split(" "));
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const context = useQuery({
    enabled: Boolean(user && clientId),
    gcTime: 0,
    queryFn: () =>
      rpcFetch(rpc.api["mcp-access"].context.$get({ query: { clientId } }), "加载授权信息失败"),
    queryKey: ["mcp-access", "context", user.id, clientId],
    retry: false,
  });
  const consent = useMutation({
    mutationFn: (accept: boolean) =>
      rpcFetch(
        rpc.api["mcp-access"].consent.$post({
          json: {
            accept,
            oauthQuery,
            scopes: accept ? scopes : undefined,
            workspaceId: accept && workspaceId ? workspaceId : undefined,
          },
        }),
        "授权失败，请从客户端重新发起连接",
      ),
    onSuccess: (data) => {
      window.location.assign(data.url);
    },
  });
  const workspace = context.data?.workspaces.find((item) => item.id === workspaceId);
  const availableScopes = workspace?.scopes.filter((scope) => requestedScopes.has(scope)) ?? [];

  return (
    <AuthPageLayout backBehavior="history" contentClassName="py-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
            授权招聘工作台访问
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            以 {user.name} 的身份，允许客户端读取所选工作空间的数据。
          </p>
        </div>
        {context.isPending && <output>正在加载工作空间…</output>}
        {context.error && (
          <p role="alert" className="text-destructive">
            {context.error.message}
          </p>
        )}
        {context.data && (
          <>
            <Separator />
            <div className="text-sm">
              <p className="font-medium">{context.data.client.name}</p>
              <div className="mt-3 flex flex-col gap-1 text-muted-foreground">
                <span className="text-xs">客户端 ID</span>
                <span className="break-all font-mono text-xs leading-5">
                  {context.data.client.id}
                </span>
              </div>
              <p className="mt-3 text-muted-foreground text-xs leading-5">
                名称由客户端提供，请确认这是你刚刚发起的连接。
              </p>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <Label htmlFor="mcp-workspace">允许访问的工作空间</Label>
              <Select
                value={workspaceId}
                onValueChange={(value) => {
                  setWorkspaceId(value);
                  setScopes(
                    context.data.workspaces
                      .find((item) => item.id === value)
                      ?.scopes.filter((scope) => requestedScopes.has(scope)) ?? [],
                  );
                }}
              >
                <SelectTrigger id="mcp-workspace" className="w-full">
                  <SelectValue placeholder="请选择工作空间" />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-(--anchor-width) overflow-hidden"
                >
                  <ScrollArea className="max-h-24" scrollbars="scroll">
                    <SelectGroup>
                      {context.data.workspaces.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="h-8">
                          <span className="truncate">{item.name}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
            {context.data.workspaces.length === 0 && (
              <p className="text-muted-foreground text-sm leading-6">当前没有可授权的工作空间。</p>
            )}
            {workspace && (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 font-medium text-sm">只读访问范围</legend>
                {availableScopes.map((scope) => (
                  <div key={scope} className="flex items-center gap-3">
                    <Checkbox
                      id={scope}
                      checked={scopes.includes(scope)}
                      onCheckedChange={(checked) =>
                        setScopes((previous) =>
                          checked
                            ? [...previous, scope]
                            : previous.filter((value) => value !== scope),
                        )
                      }
                    />
                    <Label htmlFor={scope}>{scopeLabels[scope]}</Label>
                  </div>
                ))}
                {availableScopes.length === 0 && (
                  <p className="text-muted-foreground text-sm leading-6">
                    你在此工作空间的权限不包含客户端请求的访问范围。
                  </p>
                )}
              </fieldset>
            )}
            <p className="text-muted-foreground text-sm leading-6">
              授权后，客户端可在你关闭网页后继续访问。它只能读取你当前有权查看的数据，你可以随时在“已授权应用”中撤销连接。
            </p>
          </>
        )}
        {consent.error && (
          <p role="alert" className="text-destructive text-sm">
            {consent.error.message}
          </p>
        )}
        <div className="flex flex-col gap-4">
          <Button
            size="lg"
            className="w-full"
            disabled={!workspaceId || scopes.length === 0 || !context.data || consent.isPending}
            onClick={() => consent.mutate(true)}
          >
            {consent.isPending ? "正在处理…" : "授权只读访问"}
          </Button>
          <Link
            to="/mcp/connections"
            className="self-center text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
          >
            管理已授权应用
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}

function requiresFreshLogin(params: URLSearchParams, createdAt: Date) {
  const created = new Date(createdAt).getTime();
  // This is a UI hint from Better Auth’s signed query; the provider enforces freshness.
  const issued = Number(params.get("ba_iat"));
  if ((params.get("prompt") ?? "").split(" ").includes("login") && created < issued) {
    return true;
  }
  const maxAge = params.get("max_age");
  return maxAge !== null && Date.now() - created > Number(maxAge) * 1000;
}

export function McpAuthorizePage() {
  const [oauthQuery] = useState(() => window.location.search.slice(1));
  const session = authClient.useSession();
  const params = new URLSearchParams(oauthQuery);
  const clientId = params.get("client_id");
  if (session.isPending) {
    return (
      <AuthPageLayout backBehavior="history">
        <div className="flex flex-col gap-6">
          <output>正在确认登录状态…</output>
        </div>
      </AuthPageLayout>
    );
  }
  if (!session.data) {
    return <LoginPage backBehavior="history" callbackURL={`/mcp/authorize?${oauthQuery}`} />;
  }
  if (!clientId || !params.has("sig")) {
    return (
      <AuthPageLayout backBehavior="history">
        <div className="flex flex-col gap-6">
          <h1 className="font-semibold text-xl">授权链接无效</h1>
          <p className="text-muted-foreground">请在 Codex 或 Claude Code 中重新发起 MCP 登录。</p>
        </div>
      </AuthPageLayout>
    );
  }

  if (requiresFreshLogin(params, session.data.session.createdAt)) {
    return <LoginPage backBehavior="history" callbackURL={`/mcp/authorize?${oauthQuery}`} />;
  }
  return <McpConsentForm oauthQuery={oauthQuery} user={session.data.user} />;
}
