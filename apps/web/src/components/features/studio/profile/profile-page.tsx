"use client";

import { IconBuilding } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";
import { PermissionGate } from "@/components/features/permission/permission-gate";
import { ContributionCalendar } from "@/components/features/studio/charts/contribution-calendar";
import { MailIngestAccountCard } from "@/components/features/studio/profile/mail-ingest-account-card";
import {
  ActivitySectionSkeleton,
  ProfilePageContentSkeleton,
} from "@/components/features/studio/profile/profile-page-skeleton";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@/components/features/studio/profile/profile-settings-ui";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  getWorkspaceRoleLabel,
  isBuiltInWorkspaceRole,
} from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { formatDateOnly } from "@app/shared/utils/time";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/client/auth-client";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { cn } from "@app/shared/utils";

const WHITESPACE_REGEX = /\s+/u;
const PROFILE_NAME_MAX_LENGTH = 120;
const AUTOSAVE_DEBOUNCE_MS = 1000;

const ROLE_BADGE_VARIANT = {
  admin: "default",
  member: "secondary",
  noAccess: "outline",
  owner: "default",
} as const satisfies Record<WorkspaceRole, "default" | "secondary" | "outline">;

const sessionUserProfileSchema = z.object({
  feishuTenantName: z.string().nullable().optional(),
});

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(WHITESPACE_REGEX).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function saveStatusLabel(status: SaveStatus): string | null {
  switch (status) {
    case "saving": {
      return "保存中…";
    }
    case "saved": {
      return "已保存";
    }
    case "error": {
      return "保存失败";
    }
    case "dirty": {
      return "未保存";
    }
    default: {
      return null;
    }
  }
}

function ProfileHero({
  email,
  image,
  name,
  tenantName,
}: {
  email?: string | null;
  image?: string | null;
  name: string;
  tenantName: string | null;
}) {
  const displayName = name || "未命名用户";

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <Avatar
        className="size-20 ring-1 ring-border"
        generatedSize={80}
        label={`${displayName}的头像`}
        seed={`user:${email || displayName}`}
        size="lg"
      >
        <AvatarImage alt={displayName} src={image ?? undefined} />
        <AvatarFallback className="text-lg">{getInitials(name, email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-semibold text-lg tracking-tight">{displayName}</p>
        {tenantName ? (
          <p className="text-muted-foreground text-xs">飞书租户：{tenantName}</p>
        ) : null}
      </div>
    </div>
  );
}

function ActivitySection() {
  const slug = useWorkspaceSlug();
  const activityQuery = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace["my-activity"].$get({ param: { slug } }),
        "加载个人活动失败",
      ),
    queryKey: ["workspace-my-activity", slug] as const,
  });

  const dailyAdded = useMemo(
    () => activityQuery.data?.dailyAdded ?? [],
    [activityQuery.data?.dailyAdded],
  );
  const total = useMemo(() => dailyAdded.reduce((sum, row) => sum + row.count, 0), [dailyAdded]);
  const peak = useMemo(() => Math.max(0, ...dailyAdded.map((row) => row.count)), [dailyAdded]);

  let body: React.ReactNode = (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
        <span>
          一年新增{" "}
          <span className="font-mono font-medium text-foreground tabular-nums">{total}</span>
        </span>
        <span className="text-border">·</span>
        <span>
          单日峰值{" "}
          <span className="font-mono font-medium text-foreground tabular-nums">{peak}</span>
        </span>
      </div>
      <ContributionCalendar
        dailyAdded={dailyAdded}
        emptyMessage="过去一年你还没有入库候选人"
        unitLabel="份"
      />
    </div>
  );

  if (activityQuery.isError) {
    body = (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
        {activityQuery.error instanceof Error ? activityQuery.error.message : "加载个人活动失败"}
      </p>
    );
  }

  return (
    <SkeletonReveal
      loading={activityQuery.isPending && !activityQuery.data}
      skeleton={<ActivitySectionSkeleton />}
    >
      {body}
    </SkeletonReveal>
  );
}

function OrganizationSection({
  currentRole,
  currentSlug,
  organizations,
}: {
  currentRole: string | null;
  currentSlug: string;
  organizations: {
    createdAt: Date | string;
    id: string;
    name: string;
    slug: string;
  }[];
}) {
  return (
    <SettingsSection title="我的工作区">
      <SettingsGroup>
        {organizations.length === 0 ? (
          <div className="px-3.5 py-3 text-muted-foreground text-sm">尚未加入任何工作区</div>
        ) : (
          organizations.map((organization) => {
            const isActive = organization.slug === currentSlug;
            return (
              <div
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                key={organization.id}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md border",
                      isActive
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <IconBuilding className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn("truncate font-medium text-sm", isActive && "text-foreground")}
                    >
                      {organization.name}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      /w/{organization.slug} · 加入于 {formatDateOnly(organization.createdAt)}
                    </p>
                  </div>
                </div>
                {isActive && currentRole ? (
                  <Badge
                    variant={
                      isBuiltInWorkspaceRole(currentRole)
                        ? ROLE_BADGE_VARIANT[currentRole]
                        : "outline"
                    }
                  >
                    {getWorkspaceRoleLabel(currentRole)}
                  </Badge>
                ) : null}
              </div>
            );
          })
        )}
      </SettingsGroup>
    </SettingsSection>
  );
}

export function ProfilePage() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const { data: listOrganizations } = authClient.useListOrganizations();
  const currentSlug = useWorkspaceSlug();
  const workspaceMemberRole = useWorkspaceMemberRole();
  const user = session?.user;
  const organizations = listOrganizations ?? [];

  const [name, setName] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const lastSavedNameRef = useRef("");
  const latestNameRef = useRef("");
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next = user?.name ?? "";
    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setName(next);
    lastSavedNameRef.current = next;
    latestNameRef.current = next;
    setSaveStatus("idle");
  }, [user?.name]);

  const tenantName = useMemo(
    () => sessionUserProfileSchema.safeParse(user).data?.feishuTenantName ?? null,
    [user],
  );

  const performSave = useCallback(async () => {
    const trimmed = latestNameRef.current.trim();
    if (!trimmed) {
      setSaveStatus("error");
      toast.error("姓名不能为空");
      return;
    }
    if (trimmed === lastSavedNameRef.current) {
      setSaveStatus("idle");
      return;
    }

    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;
    setSaveStatus("saving");

    const { error } = await authClient.updateUser({ name: trimmed });

    if (seq !== requestSeqRef.current || !mountedRef.current) {
      return;
    }

    if (error) {
      setSaveStatus("error");
      toast.error(error.message ?? "保存失败");
      return;
    }

    lastSavedNameRef.current = trimmed;
    setSaveStatus("saved");
    await refetch();

    if (savedResetTimerRef.current) {
      clearTimeout(savedResetTimerRef.current);
    }
    savedResetTimerRef.current = setTimeout(() => {
      if (mountedRef.current && lastSavedNameRef.current === trimmed) {
        setSaveStatus("idle");
      }
    }, 2000);
  }, [refetch]);

  const debouncedSave = useDebouncedCallback(() => {
    void performSave();
  }, AUTOSAVE_DEBOUNCE_MS);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      latestNameRef.current = value;
      if (value.trim() === lastSavedNameRef.current) {
        setSaveStatus("idle");
        debouncedSave.cancel();
        return;
      }
      setSaveStatus("dirty");
      debouncedSave();
    },
    [debouncedSave],
  );

  const handleSaveNow = useCallback(() => {
    debouncedSave.cancel();
    void performSave();
  }, [debouncedSave, performSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debouncedSave.flush();
      if (savedResetTimerRef.current) {
        clearTimeout(savedResetTimerRef.current);
      }
    };
  }, [debouncedSave]);

  const heroName = name.trim() || user?.name || "";
  const nameSaveLabel = saveStatusLabel(saveStatus);

  return (
    <SkeletonReveal loading={isPending} skeleton={<ProfilePageContentSkeleton />}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <PageHeader title="个人中心" />

        <ProfileHero
          email={user?.email}
          image={user?.image}
          name={heroName}
          tenantName={tenantName}
        />

        <ActivitySection />

        <SettingsSection title="账号资料">
          <SettingsGroup>
            <SettingsRow
              description="显示在成员列表、邀请记录和个人菜单中。"
              htmlFor="profile-name"
              label="显示名称"
            >
              <div className="flex flex-col gap-1">
                <Input
                  id="profile-name"
                  autoComplete="name"
                  disabled={isPending || saveStatus === "saving"}
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  onBlur={handleSaveNow}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="请输入姓名"
                  value={name}
                />
                {nameSaveLabel ? (
                  <p
                    className={cn(
                      "text-[11px]",
                      saveStatus === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {nameSaveLabel}
                  </p>
                ) : null}
              </div>
            </SettingsRow>
            <SettingsRow label="登录邮箱">
              <Input disabled readOnly value={user?.email ?? ""} />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>

        <OrganizationSection
          currentRole={workspaceMemberRole}
          currentSlug={currentSlug}
          organizations={organizations}
        />

        <PermissionGate resource="resumeEmailIngest" action="read">
          <MailIngestAccountCard />
        </PermissionGate>
      </div>
    </SkeletonReveal>
  );
}
