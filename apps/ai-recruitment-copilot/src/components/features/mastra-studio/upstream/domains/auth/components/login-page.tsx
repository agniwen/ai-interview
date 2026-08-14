import { Button } from "@mastra/playground-ui/components/Button";
import { Input } from "@mastra/playground-ui/components/Input";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useSSOLogin } from "../hooks/use-auth-actions";
import { useAuthCapabilities } from "../hooks/use-auth-capabilities";
import { useCredentialsLogin } from "../hooks/use-credentials-login";
import { useCredentialsSignUp } from "../hooks/use-credentials-signup";
import type { SSOConfig } from "../types";
import { LoginLayout } from "./login-layout";

export interface LoginPageProps {
  /** URL to redirect to after successful login */
  redirectUri?: string;
  /** Callback when login is successful */
  onSuccess?: () => void;
  /** Initial mode - 'signin' or 'signup' */
  initialMode?: "signin" | "signup";
  /** Error message to display (e.g. from a failed OAuth redirect) */
  errorMessage?: string | null;
}

interface CredentialsFormProps {
  email: string;
  error: Error | null;
  isPending: boolean;
  isSignIn: boolean;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleMode: () => void;
  password: string;
  signUpEnabled: boolean;
}

function getCredentialsSubmitLabel(isPending: boolean, isSignIn: boolean): string {
  if (isPending) {
    return isSignIn ? "正在登录..." : "正在创建账号...";
  }
  return isSignIn ? "登录" : "创建账号";
}

function CredentialsForm({
  email,
  error,
  isPending,
  isSignIn,
  name,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onSubmit,
  onToggleMode,
  password,
  signUpEnabled,
}: CredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isSignIn && (
        <div className="space-y-2">
          <label htmlFor="name" className="block text-sm text-neutral4">
            姓名
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="请输入姓名"
            variant="default"
            size="lg"
          />
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm text-neutral4">
          邮箱
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="you@example.com"
          required
          variant="default"
          size="lg"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm text-neutral4">
          密码
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder={isSignIn ? "请输入密码" : "请设置密码"}
          required
          variant="default"
          size="lg"
        />
      </div>
      {error && (
        <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">{error.message}</div>
      )}
      <Button type="submit" disabled={isPending} className="w-full" size="lg">
        {getCredentialsSubmitLabel(isPending, isSignIn)}
      </Button>
      {signUpEnabled && (
        <div className="text-center text-sm">
          <span className="text-neutral3">{isSignIn ? "还没有账号？" : "已经有账号？"}</span>
          <button type="button" onClick={onToggleMode} className="text-neutral6 hover:underline">
            {isSignIn ? "注册" : "登录"}
          </button>
        </div>
      )}
    </form>
  );
}

interface SSOSectionProps {
  hasCredentials: boolean;
  isPending: boolean;
  onLogin: () => void;
  sso?: SSOConfig;
}

function SSOSection({ hasCredentials, isPending, onLogin, sso }: SSOSectionProps) {
  if (!sso) {
    return null;
  }

  return (
    <>
      {hasCredentials && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border1" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-surface1 px-2 text-neutral3">或使用以下方式继续</span>
          </div>
        </div>
      )}
      <Button onClick={onLogin} disabled={isPending} className="w-full" size="lg" variant="outline">
        {sso.icon && <span className="mr-2">{sso.icon}</span>}
        {isPending ? "正在跳转..." : sso.text || "登录"}
      </Button>
    </>
  );
}

/**
 * Login page component.
 *
 * Renders a login/signup form based on the auth capabilities:
 * - For SSO-only: Shows SSO login button
 * - For credentials-only: Shows email/password form with sign in/sign up toggle
 * - For both: Shows both options
 *
 * @example
 * ```tsx
 * import { LoginPage } from '@/components/features/mastra-studio/upstream/domains/auth/components/login-page';
 *
 * function LoginRoute() {
 *   return (
 *     <LoginPage
 *       redirectUri={window.location.origin}
 *       onSuccess={() => window.location.href = '/'}
 *     />
 *   );
 * }
 * ```
 */
export function LoginPage({
  redirectUri,
  onSuccess,
  initialMode = "signin",
  errorMessage,
}: LoginPageProps) {
  const { data: capabilities, isLoading: isLoadingCapabilities } = useAuthCapabilities();
  const {
    mutate: credentialsLogin,
    isPending: isLoginPending,
    error: loginError,
  } = useCredentialsLogin();
  const {
    mutate: credentialsSignUp,
    isPending: isSignUpPending,
    error: signUpError,
  } = useCredentialsSignUp();
  const { mutate: ssoLogin, isPending: isSSOPending } = useSSOLogin();

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (isLoadingCapabilities) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface1">
        <div className="text-neutral3">正在加载...</div>
      </div>
    );
  }

  if (!capabilities?.enabled || !capabilities?.login) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface1">
        <div className="text-neutral3">尚未配置身份验证</div>
      </div>
    );
  }

  const { login } = capabilities;
  const hasSSO = login.type === "sso" || login.type === "both";
  const hasCredentials = login.type === "credentials" || login.type === "both";
  const sso = login.sso as SSOConfig | undefined;
  // Sign-up defaults to enabled.
  const signUpEnabled = login.signUpEnabled !== false;

  // Force sign-in mode if sign-up is disabled.
  const isSignIn = mode === "signin" || !signUpEnabled;
  const isPending = isSignIn ? isLoginPending : isSignUpPending;
  const error = isSignIn ? loginError : signUpError;

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    } else if (redirectUri) {
      window.location.href = redirectUri;
    } else {
      window.location.href = "/";
    }
  };

  const handleCredentialsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSignIn) {
      credentialsLogin({ email, password }, { onSuccess: handleSuccess });
    } else {
      credentialsSignUp({ email, name: name || undefined, password }, { onSuccess: handleSuccess });
    }
  };

  const handleSSOLogin = () => {
    ssoLogin(
      { redirectUri },
      {
        onSuccess: (data) => {
          window.location.href = data.url;
        },
      },
    );
  };

  const toggleMode = () => {
    setMode(isSignIn ? "signup" : "signin");
    // Clear any errors when switching modes
  };

  const description = login.description ? (
    <div className="flex items-start gap-2.5 rounded-md border border-border1 bg-surface1 p-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral4" />
      <p className="text-sm text-neutral3">{login.description}</p>
    </div>
  ) : null;

  const errorBanner = errorMessage ? (
    <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">{errorMessage}</div>
  ) : null;

  return (
    <LoginLayout
      title={isSignIn ? "登录 Mastra Studio" : "创建账号"}
      description={description}
      errorBanner={errorBanner}
    >
      {hasCredentials && (
        <CredentialsForm
          email={email}
          error={error}
          isPending={isPending}
          isSignIn={isSignIn}
          name={name}
          onEmailChange={setEmail}
          onNameChange={setName}
          onPasswordChange={setPassword}
          onSubmit={handleCredentialsSubmit}
          onToggleMode={toggleMode}
          password={password}
          signUpEnabled={signUpEnabled}
        />
      )}

      {hasSSO && (
        <SSOSection
          hasCredentials={hasCredentials}
          isPending={isSSOPending}
          onLogin={handleSSOLogin}
          sso={sso}
        />
      )}
    </LoginLayout>
  );
}
