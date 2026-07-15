import { LogoWithoutText } from "@mastra/playground-ui/components/Logo";
import { Lock } from "lucide-react";
import { useAuthCapabilities } from "../hooks/use-auth-capabilities";
import { isAuthenticated } from "../types";
import { LoginButton } from "./login-button";

export interface AuthRequiredProps {
  children: React.ReactNode;
  /** URL to redirect to for login (defaults to /login) */
  loginUrl?: string;
  /** URL to redirect to for signup (defaults to /signup) */
  signupUrl?: string;
}

/**
 * Wrapper component that shows a login prompt when authentication is required.
 *
 * If auth is enabled and the user is not authenticated, displays a message
 * prompting them to sign in. Otherwise, renders children normally.
 *
 * @example
 * ```tsx
 * import { AuthRequired } from '@/components/features/mastra-studio/upstream/domains/auth/components/auth-required';
 *
 * function ProtectedPage() {
 *   return (
 *     <AuthRequired>
 *       <MyProtectedContent />
 *     </AuthRequired>
 *   );
 * }
 * ```
 */
export function AuthRequired({
  children,
  loginUrl = "/login",
  signupUrl = "/signup",
}: AuthRequiredProps) {
  const { data: capabilities, isLoading } = useAuthCapabilities();

  // While loading, show nothing (or could show a skeleton)
  if (isLoading) {
    return <>{children}</>;
  }

  // If auth is not enabled, render children
  if (!capabilities?.enabled) {
    return <>{children}</>;
  }

  // If user is authenticated, render children
  if (isAuthenticated(capabilities)) {
    return <>{children}</>;
  }

  // User is not authenticated - show login prompt
  const redirectUri = typeof window === "undefined" ? undefined : window.location.href;

  // No login capability available - show auth required message without login option
  if (!capabilities.login) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center space-y-6 text-center">
          <LogoWithoutText className="h-16 w-16 opacity-50" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-neutral6">需要身份验证</h2>
            <p className="max-w-sm text-neutral3">
              此页面需要身份验证，但尚未配置登录方式。请联系管理员。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Login capability available - show sign in prompt
  const handleSignUp = () => {
    const url = new URL(signupUrl, window.location.origin);
    if (redirectUri) {
      url.searchParams.set("redirect", redirectUri);
    }
    window.location.href = url.toString();
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center space-y-6 text-center">
        <LogoWithoutText className="h-16 w-16 opacity-50" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-neutral6">登录后继续</h2>
          <p className="max-w-sm text-neutral3">你需要登录才能访问此页面。</p>
        </div>
        {capabilities.login.description && (
          <div className="flex items-start gap-2.5 rounded-md border border-border1 bg-surface2 p-3 text-left">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral4" />
            <p className="max-w-sm text-sm text-neutral3">{capabilities.login.description}</p>
          </div>
        )}
        <LoginButton config={capabilities.login} redirectUri={redirectUri} loginUrl={loginUrl} />
        {(capabilities.login.type === "credentials" || capabilities.login.type === "both") &&
          capabilities.login.signUpEnabled !== false && (
            <div className="text-sm">
              <span className="text-neutral3">还没有账号？</span>
              <button
                type="button"
                onClick={handleSignUp}
                className="text-neutral6 hover:underline"
              >
                注册
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
