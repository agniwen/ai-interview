"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/client/auth-client";
import { cn } from "@arc/shared/utils";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_CHECK_DEBOUNCE_MS = 400;
const SLUG_HINT_DEFAULT = "仅可包含小写字母、数字与短横线。";
const WORKSPACE_NAME_MAX_LENGTH = 120;
const WORKSPACE_SLUG_MAX_LENGTH = 80;

type SlugHintTone = "muted" | "error" | "success";

interface SlugStatus {
  hint: { tone: SlugHintTone; text: string };
  available: boolean;
}

function useSlugStatus(slug: string, enabled: boolean): SlugStatus {
  // Debounce 输入,防止每次按键都打一次 checkSlug。
  // Debounce input so we don't hammer checkSlug on every keystroke.
  const [debouncedSlug, setDebouncedSlug] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(slug), SLUG_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [slug]);

  const formatValid = slug.length > 0 && SLUG_PATTERN.test(slug);

  // checkSlug 在可用时返回 { data: { status: true } },占用时返回 { error }——压成布尔。
  // checkSlug returns { data: { status: true } } when free, { error } when taken — to bool.
  const { data: slugAvailable, isFetching } = useQuery({
    enabled: enabled && debouncedSlug.length > 0 && SLUG_PATTERN.test(debouncedSlug),
    queryFn: async () => {
      const result = await authClient.organization.checkSlug({ slug: debouncedSlug });
      return result.data?.status === true;
    },
    queryKey: ["organization-slug-check", debouncedSlug],
    staleTime: 30_000,
  });

  const isChecking = formatValid && (slug !== debouncedSlug || isFetching);

  if (slug.length > 0 && !formatValid) {
    return { available: false, hint: { text: SLUG_HINT_DEFAULT, tone: "error" } };
  }
  if (isChecking) {
    return { available: false, hint: { text: "检查可用性...", tone: "muted" } };
  }
  if (formatValid && slugAvailable === false) {
    return {
      available: false,
      hint: { text: "该 URL slug 已被占用,换一个试试。", tone: "error" },
    };
  }
  if (formatValid && slugAvailable === true) {
    return { available: true, hint: { text: "可用", tone: "success" } };
  }
  return { available: false, hint: { text: SLUG_HINT_DEFAULT, tone: "muted" } };
}

interface CreateWorkspaceDialogProps {
  // 受控用法：父组件管 open 状态（例如从 DropdownMenuItem 打开）。
  // Controlled — parent owns open state (e.g. opened from a DropdownMenuItem).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // 非受控用法：传入 trigger，Dialog 自己管 open 状态。
  // Uncontrolled — pass a trigger, the dialog manages its own state.
  trigger?: ReactNode;
}

export function CreateWorkspaceDialog({
  open: openProp,
  onOpenChange,
  trigger,
}: CreateWorkspaceDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const slugStatus = useSlugStatus(slug, open);
  const canSubmit = !submitting && name.trim().length > 0 && slugStatus.available;

  function handleOpenChange(next: boolean) {
    if (submitting) {
      return;
    }
    if (!next) {
      setName("");
      setSlug("");
    }
    setOpen(next);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const { data, error } = await authClient.organization.create({
      name: name.trim(),
      slug: slug.trim(),
    });
    setSubmitting(false);
    if (error || !data) {
      // checkSlug 已过滤掉 99% 的冲突;这里兜底竞态/服务端错误。
      // checkSlug filters most conflicts; this catches the rare race / server error.
      toast.error(error?.message ?? "创建工作区失败");
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    // 让 WorkspaceSwitcher 重新拉取列表,新建的 workspace 立刻出现。
    // Invalidate so WorkspaceSwitcher refetches and the new org shows up.
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    setOpen(false);
    await navigate({ params: { slug: data.slug }, to: "/w/$slug" });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建新工作区</DialogTitle>
          <DialogDescription>
            工作区用于隔离面试数据与团队成员，创建后会自动切换到该工作区。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" id="create-workspace-form" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="ws-name">工作区名</Label>
            <Input
              autoFocus
              id="ws-name"
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-slug">URL slug</Label>
            <Input
              aria-invalid={slugStatus.hint.tone === "error" || undefined}
              id="ws-slug"
              maxLength={WORKSPACE_SLUG_MAX_LENGTH}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9-]+"
              placeholder="acme"
              required
              value={slug}
            />
            <p
              className={cn(
                "text-xs",
                slugStatus.hint.tone === "muted" && "text-muted-foreground",
                slugStatus.hint.tone === "error" && "text-destructive",
                slugStatus.hint.tone === "success" && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {slugStatus.hint.text}
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="ghost"
          >
            取消
          </Button>
          <Button disabled={!canSubmit} form="create-workspace-form" type="submit">
            {submitting ? "创建中..." : "创建工作区"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
