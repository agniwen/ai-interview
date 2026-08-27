"use client";

import { IconMail } from "@tabler/icons-react";
import type { ReactElement } from "react";
import { useState } from "react";

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  ASSIGNABLE_ROLES,
  buildWorkspaceRoleOptions,
  getWorkspaceRoleDescription,
} from "./role-display";
import type { WorkspaceRoleOption } from "./role-display";

const EMAIL_MAX_LENGTH = 200;

interface InviteDialogProps {
  assignableRoleOptions?: readonly WorkspaceRoleOption[];
  assignableRoles?: readonly string[];
  /** 自定义触发节点；省略则用默认"邀请成员"按钮。 */
  trigger?: ReactElement;
  workspaceSlug?: string;
}

function getDefaultInviteRole(assignableRoles: readonly string[]): string {
  return assignableRoles.includes("member") ? "member" : (assignableRoles[0] ?? "member");
}

export function InviteDialog({
  assignableRoleOptions,
  assignableRoles = ASSIGNABLE_ROLES,
  trigger,
  workspaceSlug: providedWorkspaceSlug,
}: InviteDialogProps = {}) {
  const contextualWorkspaceSlug = useOptionalWorkspaceSlug();
  const workspaceSlug = providedWorkspaceSlug ?? contextualWorkspaceSlug;
  const roleOptions = assignableRoleOptions ?? buildWorkspaceRoleOptions(assignableRoles);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(() => getDefaultInviteRole(assignableRoles));
  const [submitting, setSubmitting] = useState(false);
  const canInviteWithSelectedRole = assignableRoles.includes(role);
  let submitLabel = "生成并复制链接";
  if (submitting) {
    submitLabel = "处理中";
  } else if (email.trim()) {
    submitLabel = "发送邀请";
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setRole(getDefaultInviteRole(assignableRoles));
    }
    setOpen(next);
  }

  async function onSubmit() {
    const trimmedEmail = email.trim();
    if (!canInviteWithSelectedRole) {
      return;
    }
    if (!workspaceSlug) {
      toast.error("缺少工作区信息，无法创建邀请");
      return;
    }

    setSubmitting(true);
    try {
      const link = await rpcFetch(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$post({
          json: { email: trimmedEmail || undefined, initialRole: role },
          param: { slug: workspaceSlug },
        }),
        "生成工作区邀请链接失败",
      );
      const url = `${window.location.origin}/join/${link.code}`;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // The invitation still exists and remains visible in invitation-link management.
      }
      if (link.emailDelivery === "sent") {
        toast.success(copied ? "邀请邮件已发送，工作区链接已复制" : "邀请邮件已发送");
      } else if (link.emailDelivery === "failed") {
        toast.warning(
          copied
            ? "工作区链接已复制，但邀请邮件发送失败，请手动发送链接"
            : `邀请邮件发送失败，请在邀请链接管理中复制链接：${url}`,
        );
      } else {
        toast.success(copied ? "工作区邀请链接已复制" : `工作区邀请链接已生成：${url}`);
      }
      setOpen(false);
      setEmail("");
      setRole(getDefaultInviteRole(assignableRoles));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成工作区邀请链接失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger ?? <Button>邀请成员</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>邀请新成员</DialogTitle>
          <DialogDescription>
            系统会生成工作区共享邀请链接；填写邮箱时会同时发送邀请邮件，对方打开链接后使用飞书登录即可加入。
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <FieldGroup className="gap-5">
          <Field>
            <FieldLabel htmlFor="invite-email">成员邮箱（可选）</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <IconMail />
              </InputGroupAddon>
              <InputGroupInput
                id="invite-email"
                autoComplete="email"
                inputMode="email"
                maxLength={EMAIL_MAX_LENGTH}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="可不填；不填则只生成链接"
                type="email"
                value={email}
              />
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-role">工作区角色</FieldLabel>
            <Select
              disabled={assignableRoles.length === 0}
              value={role}
              onValueChange={(nextRole) => {
                if (nextRole) {
                  setRole(nextRole);
                }
              }}
            >
              <SelectTrigger className="w-full" id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roleOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{getWorkspaceRoleDescription(role)}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={submitting || !canInviteWithSelectedRole} onClick={onSubmit}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
