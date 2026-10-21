"use client";

import {
  DEFAULT_PLATFORM_INITIAL_WORKSPACE_ROLE,
  PLATFORM_INITIAL_WORKSPACE_ROLES,
} from "@app/shared/permissions";
import type { PlatformInitialWorkspaceRole } from "@app/shared/permissions";
import { useStore } from "@tanstack/react-form";
import { useCallback } from "react";
import { toast } from "sonner";
import { EntityFormDialog } from "@/components/features/studio/entity-form-dialog";
import { useEntityForm } from "@/components/features/studio/entity-form";
import {
  hasFieldErrors,
  toFieldErrors,
} from "@/components/features/studio/interviews/interview-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildWorkspaceRoleOptions,
  getWorkspaceRoleLabel,
} from "@/components/features/studio/members/role-display";
import { InitialWorkspacePicker } from "./initial-workspace-picker";
import { PasswordInput, PasswordMatchStatus, PasswordStrengthMeter } from "./password-fields";
import {
  buildUserUpdatePlan,
  CREATED_USER_ROLE,
  createUserFormSchema,
  createUserFormValues,
  editUserFormSchema,
  getAuthErrorMessage,
  getConfirmPasswordState,
  getNextWorkspaceRole,
  PASSWORD_MISMATCH_MESSAGE,
  USER_NAME_MAX_LENGTH,
} from "./user-form";
import type {
  AuthActionError,
  EditableUser,
  PlatformWorkspaceOption,
  UserFormValues,
  UserUpdateData,
} from "./user-form";

const WORKSPACE_ROLE_OPTIONS = buildWorkspaceRoleOptions(PLATFORM_INITIAL_WORKSPACE_ROLES);

interface AuthActionResult {
  error: AuthActionError | null;
}

/**
 * 弹窗需要的平台用户管理能力：账号操作走 Better Auth admin 客户端，
 * 工作区搜索与加入走平台 RPC（失败时抛出带中文消息的错误）。
 *
 * Capabilities the dialog needs: account operations via the Better Auth admin client,
 * workspace search/membership via platform RPC (which throws errors with display messages).
 */
export interface PlatformUserAdmin {
  addUserToWorkspace: (input: {
    organizationId: string;
    role: PlatformInitialWorkspaceRole;
    userId: string;
  }) => Promise<void>;
  createUser: (input: {
    email: string;
    name: string;
    password: string;
    role: typeof CREATED_USER_ROLE;
  }) => Promise<AuthActionResult & { data: { user: { id: string } } | null }>;
  searchWorkspaces: (query: string) => Promise<PlatformWorkspaceOption[]>;
  setUserPassword: (input: { newPassword: string; userId: string }) => Promise<AuthActionResult>;
  updateUser: (input: { data: UserUpdateData; userId: string }) => Promise<AuthActionResult>;
}

async function createPlatformUser(
  userAdmin: PlatformUserAdmin,
  value: UserFormValues,
): Promise<boolean> {
  const name = value.name.trim();
  const { data, error } = await userAdmin.createUser({
    email: value.email.trim(),
    name,
    password: value.password,
    role: CREATED_USER_ROLE,
  });
  if (error || !data) {
    toast.error(getAuthErrorMessage(error, "创建用户失败"));
    return false;
  }
  if (!value.workspace) {
    toast.success(`已创建用户 ${name}`);
    return true;
  }
  const role = value.workspaceRole ?? DEFAULT_PLATFORM_INITIAL_WORKSPACE_ROLE;
  try {
    await userAdmin.addUserToWorkspace({
      organizationId: value.workspace.id,
      role,
      userId: data.user.id,
    });
  } catch (workspaceError) {
    // 账号已创建，不能让用户重新提交（邮箱会冲突）；关闭弹窗并给出不会自动消失的提示。
    // The account exists, so resubmitting would conflict: close and leave a sticky warning.
    const reason = workspaceError instanceof Error ? workspaceError.message : "未知错误";
    toast.warning(`已创建用户 ${name}，但加入工作区「${value.workspace.name}」失败`, {
      description: `${reason}。请在该工作区的成员管理中邀请此用户。`,
      duration: Number.POSITIVE_INFINITY,
    });
    return true;
  }
  toast.success(
    `已创建用户 ${name}，并以「${getWorkspaceRoleLabel(role)}」身份加入工作区「${value.workspace.name}」`,
  );
  return true;
}

async function updatePlatformUser(
  userAdmin: PlatformUserAdmin,
  user: EditableUser,
  value: UserFormValues,
): Promise<boolean> {
  const plan = buildUserUpdatePlan(user, value);
  if (!plan.data && !plan.newPassword) {
    toast.info("没有需要保存的修改");
    return true;
  }
  if (plan.data) {
    const { error } = await userAdmin.updateUser({ data: plan.data, userId: user.id });
    if (error) {
      toast.error(getAuthErrorMessage(error, "保存用户信息失败"));
      return false;
    }
  }
  if (plan.newPassword) {
    const { error } = await userAdmin.setUserPassword({
      newPassword: plan.newPassword,
      userId: user.id,
    });
    if (error) {
      toast.error(
        getAuthErrorMessage(error, plan.data ? "用户信息已保存，但重置密码失败" : "重置密码失败"),
      );
      return false;
    }
  }
  toast.success("用户信息已保存");
  return true;
}

export function UserFormDialog({
  onOpenChange,
  onSaved,
  open,
  user,
  userAdmin,
}: {
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
  open: boolean;
  /** null 为创建模式。Null opens the create mode. */
  user: EditableUser | null;
  userAdmin: PlatformUserAdmin;
}) {
  const isEdit = user !== null;
  const buildValues = useCallback(() => createUserFormValues(user), [user]);

  const { form, isSubmitting } = useEntityForm<UserFormValues>({
    buildValues,
    onSubmit: async (value) => {
      const saved = user
        ? await updatePlatformUser(userAdmin, user, value)
        : await createPlatformUser(userAdmin, value);
      // 部分成功（如姓名已保存但密码失败）也刷新列表，保证展示与服务端一致。
      // Refresh even on partial success so the list matches the server.
      await onSaved();
      if (saved) {
        onOpenChange(false);
      }
    },
    open,
    schema: isEdit ? editUserFormSchema : createUserFormSchema,
  });
  const passwordValue = useStore(form.store, (state) => state.values.password);
  const hasWorkspace = useStore(form.store, (state) => state.values.workspace !== null);

  return (
    <EntityFormDialog
      description={isEdit ? user.email : "新用户为普通用户，可使用邮箱和初始密码登录"}
      formId="platform-user-form"
      isEdit={isEdit}
      isSubmitting={isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={async () => {
        await form.handleSubmit();
      }}
      open={open}
      size="md"
      title={isEdit ? "编辑用户" : "创建用户"}
    >
      <form.Field name="name">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor="platform-user-name">
                姓名 <span className="text-destructive">*</span>
              </FieldLabel>
              <FieldContent className="gap-2">
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete="off"
                  id="platform-user-name"
                  maxLength={USER_NAME_MAX_LENGTH}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="如：张三"
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="email">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor="platform-user-email">
                邮箱 {isEdit ? null : <span className="text-destructive">*</span>}
              </FieldLabel>
              <FieldContent className="gap-2">
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete="off"
                  disabled={isEdit}
                  id="platform-user-email"
                  // 不用 type="email"：浏览器原生校验会拦截提交，导致表单的中文错误提示不显示。
                  // Avoid type="email": native validation would block submit before our messages render.
                  inputMode="email"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="name@example.com"
                  value={field.state.value}
                />
                {isEdit ? (
                  <FieldDescription>邮箱是登录账号，创建后不可修改</FieldDescription>
                ) : null}
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="password">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          // 开始输入后才显示强度提示；规则要点先放在占位文案里。
          // The meter appears once typing starts; the placeholder carries the rules before that.
          const showMeter = field.state.value.length > 0;
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor="platform-user-password">
                {isEdit ? "重置密码" : "初始密码"}{" "}
                {isEdit ? null : <span className="text-destructive">*</span>}
              </FieldLabel>
              <FieldDescription>
                {isEdit
                  ? "填写后将覆盖该用户的登录密码"
                  : "请通过安全渠道告知用户，建议首次登录后自行修改"}
              </FieldDescription>
              <FieldContent className="gap-2">
                <PasswordInput
                  describedBy={showMeter ? "platform-user-password-strength" : undefined}
                  id="platform-user-password"
                  invalid={!!errors?.length}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  placeholder={isEdit ? "留空则不修改密码" : "至少 8 位，含 3 类字符"}
                  value={field.state.value}
                />
                <FieldError errors={errors} />
                {showMeter ? (
                  <PasswordStrengthMeter
                    id="platform-user-password-strength"
                    password={field.state.value}
                  />
                ) : null}
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="confirmPassword">
        {(field) => {
          const confirmState = getConfirmPasswordState(passwordValue, field.state.value, {
            blurred: field.state.meta.isBlurred,
          });
          // 实时状态优先：一致时清掉上次提交留下的「不一致」，不一致时立即提示。
          // Live state wins: a match clears a stale submit mismatch; a mismatch shows at once.
          const submitErrors = (toFieldErrors(field.state.meta.errors) ?? []).filter(
            (error) => error.message !== PASSWORD_MISMATCH_MESSAGE,
          );
          let errors = submitErrors;
          if (confirmState === "mismatch") {
            errors = [{ message: PASSWORD_MISMATCH_MESSAGE }];
          } else if (confirmState === "match") {
            errors = [];
          }
          const invalid = errors.length > 0;
          const errorId = "platform-user-confirm-password-error";
          const matchId = "platform-user-confirm-password-match";
          let describedBy: string | undefined;
          if (invalid) {
            describedBy = errorId;
          } else if (confirmState === "match") {
            describedBy = matchId;
          }
          return (
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="platform-user-confirm-password">
                确认密码 {isEdit ? null : <span className="text-destructive">*</span>}
              </FieldLabel>
              <FieldContent className="gap-2">
                <PasswordInput
                  describedBy={describedBy}
                  id="platform-user-confirm-password"
                  invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  placeholder={isEdit ? "修改密码时再次输入" : "再次输入密码"}
                  value={field.state.value}
                />
                <FieldError errors={errors} id={errorId} />
                {confirmState === "match" ? <PasswordMatchStatus id={matchId} /> : null}
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      {isEdit ? null : (
        <form.Field name="workspace">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="platform-user-workspace">初始工作区（可选）</FieldLabel>
              <FieldContent className="gap-2">
                <InitialWorkspacePicker
                  id="platform-user-workspace"
                  onChange={(workspace) => {
                    const nextRole = getNextWorkspaceRole(
                      field.state.value,
                      workspace,
                      form.getFieldValue("workspaceRole"),
                    );
                    field.handleChange(workspace);
                    form.setFieldValue("workspaceRole", nextRole);
                  }}
                  searchWorkspaces={userAdmin.searchWorkspaces}
                  value={field.state.value}
                />
              </FieldContent>
            </Field>
          )}
        </form.Field>
      )}

      {!isEdit && hasWorkspace ? (
        <form.Field name="workspaceRole">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            const selected = field.state.value;
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor="platform-user-workspace-role">
                  工作区角色 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent className="gap-2">
                  <Select
                    onValueChange={(value) => {
                      const role = PLATFORM_INITIAL_WORKSPACE_ROLES.find((item) => item === value);
                      field.handleChange(role ?? null);
                    }}
                    value={selected}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors?.length}
                      className="w-full"
                      id="platform-user-workspace-role"
                    >
                      <SelectValue placeholder="请选择工作区角色" />
                    </SelectTrigger>
                    {/* 选项带说明：弹层落在触发框下方而不是覆盖它，宽度至少与触发框相同、
                        不小于 18rem，并且不超出可用宽度（手机抽屉内同样适用）。
                        Options carry descriptions: open below the trigger instead of over it,
                        at least trigger-wide and 18rem, capped to the available width. */}
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="w-(--anchor-width) min-w-[min(18rem,var(--available-width))] max-w-(--available-width)"
                    >
                      {WORKSPACE_ROLE_OPTIONS.map((option) => (
                        <SelectItem
                          className="items-start py-2 [&_[data-slot=select-item-indicator]]:top-2.5"
                          key={option.value}
                          value={option.value}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-muted-foreground text-xs leading-4">
                              {option.description}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {selected
                      ? WORKSPACE_ROLE_OPTIONS.find((option) => option.value === selected)
                          ?.description
                      : "更换工作区后需要重新选择角色"}
                  </FieldDescription>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      ) : null}
    </EntityFormDialog>
  );
}
