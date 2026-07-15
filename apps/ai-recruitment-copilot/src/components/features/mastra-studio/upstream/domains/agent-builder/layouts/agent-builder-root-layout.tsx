import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Toaster } from "@mastra/playground-ui/components/Toaster";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { AlertTriangle, ArrowLeft, Eye, LockIcon, Settings } from "lucide-react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "@/components/features/mastra-studio/router/compat";
import { useBuilderAgentAccess } from "../hooks/use-builder-agent-access";
import { useAuthCapabilities } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-auth-capabilities";
import { useRoleImpersonation } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-role-impersonation";
import { isAuthenticated } from "@/components/features/mastra-studio/upstream/domains/auth/types";
import type { LinkComponentProviderProps } from "@/components/features/mastra-studio/upstream/lib/framework";
import { LinkComponentProvider } from "@/components/features/mastra-studio/upstream/lib/framework";
import { Link } from "@/components/features/mastra-studio/upstream/lib/link";

export interface AgentBuilderRootLayoutProps {
  paths: LinkComponentProviderProps["paths"];
}

function AccessDeniedScreen() {
  const { isImpersonating, impersonatedRole, stopImpersonation } = useRoleImpersonation();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <EmptyState
          iconSlot={<LockIcon />}
          titleSlot="访问被拒绝"
          descriptionSlot="你没有访问智能体构建器的权限。"
        />
        <div className="flex items-center gap-2">
          <Button as="a" href="/agents" variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回 Studio
          </Button>
          {isImpersonating && (
            <Button variant="default" size="sm" onClick={stopImpersonation}>
              <Eye className="h-3.5 w-3.5" />
              Exit {impersonatedRole?.name} preview
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const AgentBuilderPermissionsGuard = ({ paths }: AgentBuilderRootLayoutProps) => {
  const navigate = useNavigate();
  const { isLoading, denialReason, hasAgentFeature } = useBuilderAgentAccess();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (denialReason === "permission-denied") {
    return <AccessDeniedScreen />;
  }

  if (denialReason === "error") {
    return (
      <div className="flex h-screen items-center justify-center">
        <EmptyState
          iconSlot={<AlertTriangle />}
          titleSlot="错误"
          descriptionSlot="加载智能体构建器配置失败。"
        />
      </div>
    );
  }

  if (denialReason === "not-configured") {
    return (
      <div className="flex h-screen items-center justify-center">
        <EmptyState
          iconSlot={<Settings />}
          titleSlot="智能体构建器尚未配置"
          descriptionSlot="智能体构建器未启用。请联系管理员启用此功能。"
        />
      </div>
    );
  }

  // Redirect to first available feature
  if (!hasAgentFeature) {
    return (
      <div className="flex h-screen items-center justify-center">
        <EmptyState
          iconSlot={<Settings />}
          titleSlot="未启用任何功能"
          descriptionSlot="尚未配置智能体构建器功能。"
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <LinkComponentProvider Link={Link} navigate={navigate} paths={paths}>
        <Outlet />
        <Toaster position="bottom-right" />
      </LinkComponentProvider>
    </TooltipProvider>
  );
};

export const AgentBuilderRootLayout = ({ paths }: AgentBuilderRootLayoutProps) => {
  const location = useLocation();
  const { data: authCapabilities, isLoading } = useAuthCapabilities();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (authCapabilities?.enabled && !isAuthenticated(authCapabilities)) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    const url = `/login?redirect=${encodeURIComponent(redirectPath)}`;
    return <Navigate to={url} replace />;
  }

  return <AgentBuilderPermissionsGuard paths={paths} />;
};
