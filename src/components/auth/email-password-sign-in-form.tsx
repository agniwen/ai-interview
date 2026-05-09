"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/client/auth-client";

interface EmailPasswordSignInFormProps {
  /** 登录成功后跳转的相对路径 / Redirect target after successful sign-in. */
  callbackURL: string;
  /** 自定义提交按钮文案 / Override the submit button label. */
  submitLabel?: string;
  /** 内部表单的额外 className（控制间距等）/ Extra wrapper className. */
  className?: string;
}

export function EmailPasswordSignInForm({
  callbackURL,
  submitLabel = "登录",
  className,
}: EmailPasswordSignInFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast.error("请输入账号和密码");
      return;
    }
    setSubmitting(true);
    const { error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message ?? "登录失败，请检查账号或密码");
      return;
    }
    // 登录成功后跳转。用 router.replace 避免回退到登录页。
    // Use replace so the back button doesn't return to the login page.
    router.replace(callbackURL);
    router.refresh();
  }

  return (
    <form className={className ?? "space-y-3"} onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">账号（邮箱）</Label>
        <Input
          autoComplete="username"
          id="signin-email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">密码</Label>
        <Input
          autoComplete="current-password"
          id="signin-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          required
          type="password"
          value={password}
        />
      </div>
      <Button className="w-full gap-2" disabled={submitting} size="lg" type="submit">
        {submitting ? (
          <>
            <LoaderCircleIcon className="size-4 animate-spin" />
            登录中…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
