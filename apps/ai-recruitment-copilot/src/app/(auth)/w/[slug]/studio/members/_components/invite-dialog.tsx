"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { MailIcon } from "lucide-react";
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
import { authClient } from "@/lib/client/auth-client";
import {
  ASSIGNABLE_ROLES,
  getWorkspaceRoleDescription,
  getWorkspaceRoleLabel,
} from "./role-display";
import type { WorkspaceRole } from "./role-display";

const EMAIL_MAX_LENGTH = 200;

interface InviteDialogProps {
  /** 自定义触发节点；省略则用默认"邀请成员"按钮。 */
  trigger?: ReactNode;
}

export function InviteDialog({ trigger }: InviteDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("hr");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }

    setSubmitting(true);
    const { data, error } = await authClient.organization.inviteMember({
      email: trimmedEmail,
      role,
    });
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? "邀请失败");
      return;
    }
    const url = `${window.location.origin}/invite/${data.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`邀请链接已复制到剪贴板: ${url}`);
    } catch {
      toast.success(`邀请链接已生成: ${url}`);
    }
    setOpen(false);
    setEmail("");
    setRole("hr");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>邀请成员</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>邀请新成员</DialogTitle>
          <DialogDescription>
            生成一次性邀请链接后会自动复制到剪贴板，可直接发给对方加入当前工作区。
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <FieldGroup className="gap-5">
          <Field>
            <FieldLabel htmlFor="invite-email">成员邮箱</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <MailIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="invite-email"
                autoComplete="email"
                inputMode="email"
                maxLength={EMAIL_MAX_LENGTH}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                type="email"
                value={email}
              />
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-role">工作区角色</FieldLabel>
            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
              <SelectTrigger className="w-full" id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ASSIGNABLE_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {getWorkspaceRoleLabel(item)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{getWorkspaceRoleDescription(role)}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={submitting || !email.trim()} onClick={onSubmit}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? "正在生成" : "生成邀请链接"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
