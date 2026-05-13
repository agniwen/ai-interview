"use client";

import { useQueryClient } from "@tanstack/react-query";
import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/shared/auth-client";

interface WorkspaceSettingsDialogProps {
  currentName: string;
}

export function WorkspaceSettingsDialog({ currentName }: WorkspaceSettingsDialogProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { refetch } = authClient.useActiveOrganization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setFieldError(null);
    }
  }, [currentName, open]);

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
    try {
      await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.$patch({
          json: { name: trimmedName },
          param: { slug },
        }),
        "更新工作区名称失败",
      );
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      toast.success("工作区名称已更新");
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新工作区名称失败";
      setFieldError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SettingsIcon data-icon="inline-start" />
          设置
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>工作区设置</DialogTitle>
          <DialogDescription>修改当前工作区的显示名称。</DialogDescription>
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
          <DialogClose asChild>
            <Button disabled={submitting} type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button disabled={!canSubmit} form="workspace-settings-form" type="submit">
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
