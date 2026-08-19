"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { PageHeader } from "@/components/features/studio/page-header";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { MarkdownEditor } from "@/components/features/markdown-editor";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { GlobalConfigRecord } from "@arc/shared/global-config";

const PROMPT_MAX_LENGTH = 10_000;
const COMPANY_CONTEXT_MAX_LENGTH = 8000;
const COMPANY_NAME_MAX_LENGTH = 120;
const JOB_CODE_PREFIX_MAX_LENGTH = 3;
const AUTOSAVE_DEBOUNCE_MS = 1000;

interface Props {
  initial: GlobalConfigRecord;
}

interface FormSnapshot {
  closingInstructions: string;
  companyContext: string;
  companyName: string;
  jobCodePrefix: string;
  openingInstructions: string;
}

function toSnapshot(record: GlobalConfigRecord): FormSnapshot {
  return {
    closingInstructions: record.closingInstructions,
    companyContext: record.companyContext,
    companyName: record.companyName,
    jobCodePrefix: record.jobCodePrefix,
    openingInstructions: record.openingInstructions,
  };
}

function isSameSnapshot(a: FormSnapshot, b: FormSnapshot) {
  return (
    a.closingInstructions === b.closingInstructions &&
    a.companyContext === b.companyContext &&
    a.companyName === b.companyName &&
    a.jobCodePrefix === b.jobCodePrefix &&
    a.openingInstructions === b.openingInstructions
  );
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
  const [jobCodePrefix, setJobCodePrefix] = useState(initial.jobCodePrefix);

  const [initialSnapshot] = useState(() => toSnapshot(initial));
  const lastSavedRef = useRef<FormSnapshot>(initialSnapshot);
  const latestRef = useRef<FormSnapshot>(initialSnapshot);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    latestRef.current = {
      closingInstructions: closing,
      companyContext: company,
      companyName,
      jobCodePrefix,
      openingInstructions: opening,
    };
  }, [closing, company, companyName, jobCodePrefix, opening]);

  const performSave = useCallback(async () => {
    const values = latestRef.current;
    if (isSameSnapshot(values, lastSavedRef.current)) {
      return;
    }

    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;
    try {
      const saved = await rpcFetch<GlobalConfigRecord>(
        rpc.api.w[":slug"].studio["global-config"].$put({
          json: values,
          param: { slug },
        }),
        "保存失败",
      );
      if (seq !== requestSeqRef.current) {
        return;
      }
      lastSavedRef.current = {
        ...values,
        jobCodePrefix: saved.jobCodePrefix,
      };
      toast.success("自动保存成功");
      if (mountedRef.current) {
        setJobCodePrefix(saved.jobCodePrefix);
      }
    } catch (error) {
      if (seq === requestSeqRef.current) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    }
  }, [slug]);

  const debouncedSave = useDebouncedCallback(() => {
    void performSave();
  }, AUTOSAVE_DEBOUNCE_MS);

  useEffect(() => {
    if (isSameSnapshot(latestRef.current, lastSavedRef.current)) {
      return;
    }
    debouncedSave();
  }, [opening, closing, company, companyName, jobCodePrefix, debouncedSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="公司简介显示在候选人准备页；话术用于 AI 面试开场与收尾。"
        title="上下文设置"
      />

      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="company-name">公司名称</FieldLabel>
          <FieldDescription>
            用于面试邀请邮件的主题和正文，以及候选人面前展示的发件方名称。
          </FieldDescription>
          <InputGroup>
            <InputGroupInput
              id="company-name"
              maxLength={COMPANY_NAME_MAX_LENGTH}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="例如：Acme 科技"
              value={companyName}
            />
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="job-code-prefix">岗位编码前缀</FieldLabel>
          <FieldDescription>创建岗位时编码使用此前缀，后接 4 位数字或字母。</FieldDescription>
          <InputGroup>
            <InputGroupInput
              id="job-code-prefix"
              maxLength={JOB_CODE_PREFIX_MAX_LENGTH}
              onChange={(event) => setJobCodePrefix(event.target.value)}
              placeholder="AUR"
              value={jobCodePrefix}
            />
          </InputGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="opening">开场白 prompt</FieldLabel>
          <PlaceholderDescription />
          <MarkdownEditor
            id="opening"
            maxLength={PROMPT_MAX_LENGTH}
            onChange={setOpening}
            placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
            value={opening}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="closing">结束语 prompt</FieldLabel>
          <PlaceholderDescription />
          <MarkdownEditor
            id="closing"
            maxLength={PROMPT_MAX_LENGTH}
            onChange={setClosing}
            placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
            value={closing}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="company">公司简介</FieldLabel>
          <FieldDescription>
            候选人在面试准备页可以看到这段公司简介，面试 agent 也会参考这里回答相关问题。
          </FieldDescription>
          <MarkdownEditor
            id="company"
            maxLength={COMPANY_CONTEXT_MAX_LENGTH}
            onChange={setCompany}
            placeholder="公司业务、规模、文化等简介内容。"
            value={company}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}
