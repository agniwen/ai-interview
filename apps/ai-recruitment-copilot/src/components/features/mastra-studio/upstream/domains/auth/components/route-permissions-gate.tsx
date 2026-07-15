import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { Spinner } from "@mastra/playground-ui/components/Spinner";

import { usePermissionPatterns } from "../hooks/use-permission-patterns";
import { ALL_SIDEBAR_PERMISSIONS } from "../route-permissions";

/**
 * Async replacement for the old static `P()` validator.
 *
 * On `main`, every route-permission literal was validated at module-eval time
 * against `PERMISSION_PATTERNS` imported synchronously from
 * `@mastra/core/auth/ee` — invalid literals threw immediately. We no longer
 * import the server-only EE code into the browser, so the authoritative pattern
 * vocabulary is fetched from `GET /auth/permission-patterns` instead.
 *
 * This gate is the single place that bridges that gap:
 * - while the patterns load, it renders a spinner (no children, no gating
 *   decisions made against an empty pattern set);
 * - once loaded, it validates every route-permission literal and throws on an
 *   invalid one (same fail-fast semantics as the old `P()`), surfacing via the
 *   app error boundary;
 * - otherwise it renders its children.
 *
 * Mounted once near the top of the app (see App.tsx), so every downstream
 * consumer (`RoutePermissionGuard`, `StudioIndexRedirect`, the sidebar) can
 * assume patterns are loaded and valid and only wait on the user's own
 * permissions.
 *
 * When RBAC is disabled, `usePermissionPatterns` resolves immediately with an
 * empty set and no request — route gating is a no-op, so the gate renders
 * children without validating.
 */

export interface RoutePermissionsGateProps {
  children: React.ReactNode;
  baseUrl: string;
}

interface GateInvalidBaseUrlProps {
  error: Error;
  baseUrl: string;
}

const GateInvalidBaseUrl = ({ error, baseUrl }: GateInvalidBaseUrlProps) => {
  const messages = [
    `Studio 无法连接 ${baseUrl} 上的 ARC Mastra 服务器。请检查集成服务器是否正在运行。`,
    `错误：${error.message}`,
  ];

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ErrorState
        title="Studio 加载失败"
        message={messages.join("\n\n")}
        action={<Button onClick={() => window.location.reload()}>刷新</Button>}
      />
    </div>
  );
};

export function RoutePermissionsGate({ children, baseUrl }: RoutePermissionsGateProps) {
  const { patterns, isLoading, error } = usePermissionPatterns();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <GateInvalidBaseUrl error={error} baseUrl={baseUrl} />;
  }

  // Only validate when RBAC is actually in effect (non-empty pattern set).
  // RBAC-off resolves with an empty set and gating is a no-op.
  if (patterns.size > 0) {
    for (const literal of ALL_SIDEBAR_PERMISSIONS) {
      if (!patterns.has(literal)) {
        throw new Error(
          `无效的权限模式：“${literal}”。服务器的 PERMISSION_PATTERNS 中不存在该模式，请检查 route-permissions.ts 是否拼写错误。`,
        );
      }
    }
  }

  return <>{children}</>;
}
