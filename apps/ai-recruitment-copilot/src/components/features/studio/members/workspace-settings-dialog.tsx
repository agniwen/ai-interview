"use client";

import { IconSettings } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { runAsyncAction } from "@/lib/client/async-control";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceId, useWorkspaceSlug } from "@/lib/client/workspace-context";

interface WorkspaceSettingsDialogProps {
  currentName: string;
  trigger?: ReactElement;
}

export function WorkspaceSettingsDialog({ currentName, trigger }: WorkspaceSettingsDialogProps) {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(currentName);
      setFieldError(null);
    }
    setOpen(next);
  }

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== currentName.trim() && !submitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName) {
      setFieldError("请输入工作区名称。");
      return;
    }
    if (trimmedName.length > 80) {
      setFieldError("工作区名称不能超过 80 个字符。");
      return;
    }

    setSubmitting(true);
    setFieldError(null);
    await runAsyncAction({
      cleanup: () => setSubmitting(false),
      onError: (error) => {
        const message = error instanceof Error ? error.message : "更新工作区名称失败";
        setFieldError(message);
        toast.error(message);
      },
      operation: async () => {
        await rpcFetch(
          rpc.api.w[":slug"].studio.workspace.$patch({
            json: { name: trimmedName },
            param: { slug },
          }),
          "更新工作区名称失败",
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workspace-organization", workspaceId] }),
          queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        ]);
        toast.success("工作区名称已更新");
        setOpen(false);
      },
    });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline">
              <IconSettings data-icon="inline-start" />
              设置
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>工作区设置</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" id="workspace-settings-form" onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!fieldError}>
              <FieldLabel htmlFor="workspace-name">工作区名称</FieldLabel>
              <Input
                aria-invalid={!!fieldError}
                autoComplete="organization"
                disabled={submitting}
                id="workspace-name"
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldError(null);
                }}
                value={name}
              />
              <FieldDescription>用于侧边栏切换器和工作区列表展示。</FieldDescription>
              <FieldError>{fieldError}</FieldError>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose
            render={
              <Button disabled={submitting} type="button" variant="outline">
                取消
              </Button>
            }
          />
          <Button disabled={!canSubmit} form="workspace-settings-form" type="submit">
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
