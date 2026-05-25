"use client";

import { SaveIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { MarkdownEditor } from "@/components/markdown-editor";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { GlobalConfigRecord } from "@/lib/shared/global-config";

const PROMPT_MAX_LENGTH = 10_000;
const COMPANY_CONTEXT_MAX_LENGTH = 8000;
const COMPANY_NAME_MAX_LENGTH = 120;

interface Props {
  initial: GlobalConfigRecord;
}

function PlaceholderDescription() {
  return (
    <FieldDescription>
      可用占位符：<code className="rounded bg-muted px-1">{"{候选人姓名}"}</code>、
      <code className="rounded bg-muted px-1">{"{岗位}"}</code>
      ，将在面试开始或结束时自动替换为真实值。
    </FieldDescription>
  );
}

export function GlobalConfigForm({ initial }: Props) {
  const slug = useWorkspaceSlug();
  const [opening, setOpening] = useState(initial.openingInstructions);
  const [closing, setClosing] = useState(initial.closingInstructions);
  const [company, setCompany] = useState(initial.companyContext);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const res = await rpc.api.w[":slug"].studio["global-config"].$put({
        json: {
          closingInstructions: closing,
          companyContext: company,
          companyName,
          openingInstructions: opening,
        },
        param: { slug },
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="系统设置"
        description="这些指令会注入到所有面试 agent。留空则使用系统默认文案。"
      />

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Agent 全局指令</CardTitle>
          <CardDescription>配置面试话术和公司背景，所有面试都会默认继承。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="company-name">公司名称</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  disabled={pending}
                  id="company-name"
                  maxLength={COMPANY_NAME_MAX_LENGTH}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="例如：Acme 科技"
                  value={companyName}
                />
              </InputGroup>
              <FieldDescription>
                用于面试邀请邮件的主题和正文，以及候选人面前展示的发件方名称。
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="opening">开场白 prompt</FieldLabel>
              <MarkdownEditor
                disabled={pending}
                id="opening"
                maxLength={PROMPT_MAX_LENGTH}
                onChange={setOpening}
                placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
                value={opening}
              />
              <PlaceholderDescription />
            </Field>

            <Field>
              <FieldLabel htmlFor="closing">结束语 prompt</FieldLabel>
              <MarkdownEditor
                disabled={pending}
                id="closing"
                maxLength={PROMPT_MAX_LENGTH}
                onChange={setClosing}
                placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
                value={closing}
              />
              <PlaceholderDescription />
            </Field>

            <Field>
              <FieldLabel htmlFor="company">公司资料</FieldLabel>
              <MarkdownEditor
                disabled={pending}
                id="company"
                maxLength={COMPANY_CONTEXT_MAX_LENGTH}
                onChange={setCompany}
                placeholder="公司业务、规模、文化等，候选人若问及可由此回答。"
                value={company}
              />
              <FieldDescription>
                候选人主动问到公司相关信息时，agent 会优先参考这里。
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button disabled={pending} onClick={onSave}>
            {pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            {pending ? "保存中" : "保存配置"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
