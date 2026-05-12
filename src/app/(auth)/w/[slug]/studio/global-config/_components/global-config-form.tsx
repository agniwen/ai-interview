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
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { GlobalConfigRecord } from "@/lib/shared/global-config";

const PROMPT_MAX_LENGTH = 10_000;
const COMPANY_CONTEXT_MAX_LENGTH = 8000;

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
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const res = await rpc.api.w[":slug"].studio["global-config"].$put({
        json: {
          closingInstructions: closing,
          companyContext: company,
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
        title="全局配置"
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
              <FieldLabel htmlFor="opening">开场白 prompt</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  className="pb-6"
                  id="opening"
                  disabled={pending}
                  maxLength={PROMPT_MAX_LENGTH}
                  onChange={(event) => setOpening(event.target.value)}
                  placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
                  rows={5}
                  value={opening}
                />
                <TextareaCounter maxLength={PROMPT_MAX_LENGTH} value={opening} />
              </InputGroup>
              <PlaceholderDescription />
            </Field>

            <Field>
              <FieldLabel htmlFor="closing">结束语 prompt</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  className="pb-6"
                  id="closing"
                  disabled={pending}
                  maxLength={PROMPT_MAX_LENGTH}
                  onChange={(event) => setClosing(event.target.value)}
                  placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
                  rows={4}
                  value={closing}
                />
                <TextareaCounter maxLength={PROMPT_MAX_LENGTH} value={closing} />
              </InputGroup>
              <PlaceholderDescription />
            </Field>

            <Field>
              <FieldLabel htmlFor="company">公司资料</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  className="pb-6"
                  id="company"
                  disabled={pending}
                  maxLength={COMPANY_CONTEXT_MAX_LENGTH}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="公司业务、规模、文化等，候选人若问及可由此回答。"
                  rows={8}
                  value={company}
                />
                <TextareaCounter maxLength={COMPANY_CONTEXT_MAX_LENGTH} value={company} />
              </InputGroup>
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
