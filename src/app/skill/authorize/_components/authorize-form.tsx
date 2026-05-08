"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthorizeFormProps {
  initialUserCode: string;
  userName: string;
}

type Phase = "idle" | "submitting" | "approved" | "denied";

const USER_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function AuthorizeForm({ initialUserCode, userName }: AuthorizeFormProps) {
  const router = useRouter();
  const [userCode, setUserCode] = useState(initialUserCode);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitDecision = async (action: "approve" | "deny") => {
    const trimmed = userCode.trim().toUpperCase();
    if (!USER_CODE_PATTERN.test(trimmed)) {
      setErrorMessage("授权码格式不正确，应形如 ABCD-EFGH。");
      return;
    }

    setPhase("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/skill/v1/auth/device/${action}`, {
        body: JSON.stringify({ user_code: trimmed }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setErrorMessage(payload.error ?? "操作失败，请稍后重试。");
        setPhase("idle");
        toast.error(payload.error ?? "操作失败");
        return;
      }

      if (action === "approve") {
        setPhase("approved");
        toast.success("已授权，请回到终端继续。");
      } else {
        setPhase("denied");
        toast.success("已拒绝该授权请求。");
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "网络错误，请重试。";
      setErrorMessage(message);
      setPhase("idle");
      toast.error(message);
    }
  };

  if (phase === "approved") {
    return (
      <Alert>
        <AlertDescription>
          ✅ 已授权 <span className="font-mono">{userCode}</span>
          ，请回到终端，skill 会自动获取访问令牌。可以关闭本页。
        </AlertDescription>
      </Alert>
    );
  }

  if (phase === "denied") {
    return (
      <Alert>
        <AlertDescription>
          已拒绝 <span className="font-mono">{userCode}</span>。终端会显示授权被拒。
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted text-sm">
        当前登录账号：<span className="font-medium text-foreground">{userName}</span>
      </p>
      <div className="space-y-2">
        <Label htmlFor="user-code">授权码</Label>
        <Input
          autoComplete="off"
          className="font-mono uppercase tracking-widest"
          id="user-code"
          maxLength={9}
          onChange={(e) => setUserCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          value={userCode}
        />
        <p className="text-muted text-xs">请确认上方授权码与终端中显示的一致。</p>
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          isPending={phase === "submitting"}
          onClick={() => submitDecision("approve")}
        >
          确认授权
        </Button>
        <Button
          isDisabled={phase === "submitting"}
          onClick={() => submitDecision("deny")}
          variant="outline"
        >
          拒绝
        </Button>
      </div>
    </div>
  );
}
