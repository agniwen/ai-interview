"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/client/auth-client";
import { withCleanup } from "@/lib/client/async-control";
import * as m from "@/paraglide/messages";
import { getBannedAuthMessage, isBannedAuthError } from "./auth-error";

interface EmailPasswordSignInFormProps {
  /** 登录成功后跳转的相对路径 / Redirect target after successful sign-in. */
  callbackURL: string;
  /** 自定义提交按钮文案 / Override the submit button label. */
  submitLabel?: string;
  /** 内部表单的额外 className（控制间距等）/ Extra wrapper className. */
  className?: string;
}

const EMAIL_MAX_LENGTH = 200;
const PASSWORD_MAX_LENGTH = 256;

export function EmailPasswordSignInForm({
  callbackURL,
  submitLabel = m.login_submit(),
  className,
}: EmailPasswordSignInFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast.error(m.login_missing_credentials());
      return;
    }
    setSubmitting(true);
    let shouldResetSubmitting = true;
    await withCleanup(
      async () => {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) {
          if (isBannedAuthError(error)) {
            toast.error(getBannedAuthMessage(error.message, m.login_banned()));
            await authClient.signOut();
            await navigate({ replace: true, to: "/" });
            return;
          }
          toast.error(error.message ?? m.login_failed());
          return;
        }
        // 登录成功后跳转。用 router.replace 避免回退到登录页。
        // Use replace so the back button doesn't return to the login page.
        await navigate({ href: callbackURL, replace: true });
        shouldResetSubmitting = false;
      },
      () => {
        if (shouldResetSubmitting) {
          setSubmitting(false);
        }
      },
    );
  }

  return (
    <form className={className ?? "space-y-3"} onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">{m.login_email_label()}</Label>
        <Input
          autoComplete="username"
          id="signin-email"
          maxLength={EMAIL_MAX_LENGTH}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          spellCheck={false}
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">{m.login_password_label()}</Label>
        <Input
          autoComplete="current-password"
          id="signin-password"
          maxLength={PASSWORD_MAX_LENGTH}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={m.login_password_placeholder()}
          required
          spellCheck={false}
          type="password"
          value={password}
        />
      </div>
      <Button className="w-full gap-2" disabled={submitting} size="lg" type="submit">
        {submitting ? (
          <>
            <IconLoader2 className="size-4 animate-spin" />
            {m.login_submitting()}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
