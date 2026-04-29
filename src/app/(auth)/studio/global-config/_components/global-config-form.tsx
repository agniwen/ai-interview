"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { GlobalConfigRecord } from "@/lib/global-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  initial: GlobalConfigRecord;
}

export function GlobalConfigForm({ initial }: Props) {
  const [opening, setOpening] = useState(initial.openingInstructions);
  const [closing, setClosing] = useState(initial.closingInstructions);
  const [company, setCompany] = useState(initial.companyContext);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const res = await fetch("/api/studio/global-config", {
        body: JSON.stringify({
          closingInstructions: closing,
          companyContext: company,
          openingInstructions: opening,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({ error: "保存失败" }))) as {
          error?: string;
        };
        toast.error(error ?? "保存失败");
        return;
      }
      toast.success("已保存");
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">全局配置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          这些指令会注入到所有面试 agent。留空则使用系统默认文案。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opening">开场白指令</Label>
        <Textarea
          id="opening"
          rows={4}
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
        />
        <p className="text-xs text-muted-foreground">
          注入位置：面试开始时 agent 的 on_enter 指令。占位符 {"{候选人姓名}"} {"{岗位}"} 由 LLM
          自行替换。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="closing">结束语指令</Label>
        <Textarea
          id="closing"
          rows={3}
          value={closing}
          onChange={(e) => setClosing(e.target.value)}
          placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
        />
        <p className="text-xs text-muted-foreground">
          注入位置：end_call 工具的 end_instructions 与超时兜底告别。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">公司情况</Label>
        <Textarea
          id="company"
          rows={8}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="公司业务、规模、文化等，候选人若问及可由此回答。"
        />
        <p className="text-xs text-muted-foreground">
          注入位置：system prompt 顶部的"## 公司情况"段。
        </p>
      </div>

      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
