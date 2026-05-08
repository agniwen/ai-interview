"use client";

import type { ReactNode } from "react";
import { ChevronsUpDownIcon, HouseIcon, LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { FeishuSignInButton } from "@/components/auth/feishu-sign-in-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

const WHITESPACE_REGEX = /\s+/;

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

// oxlint-disable-next-line complexity -- Shared user section branches on session state and collapse variants.
export function SidebarUserSection({
  collapsed,
  callbackURL = "/",
  showHomeLink = true,
}: {
  collapsed: boolean;
  callbackURL?: string;
  showHomeLink?: boolean;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    router.replace("/");
  }, [router]);

  const showLoading = !isHydrated || isPending;
  const userName = session?.user?.name ?? "用户";
  const userEmail = session?.user?.email ?? "";
  const organizationName = session?.user?.organizationName ?? null;
  const userInitials = getInitials(session?.user?.name, session?.user?.email);

  let content: ReactNode;

  if (showLoading) {
    content = collapsed ? (
      <div className="h-9 w-full animate-pulse rounded-md bg-default" />
    ) : (
      <div className="h-9 w-full animate-pulse rounded-full bg-default" />
    );
  } else if (session?.user) {
    const menuContent = (
      <DropdownPopover placement="bottom end">
        <DropdownMenu className="w-56">
          <DropdownSection>
            <DropdownItem>
              <div className="space-y-0.5">
                <p className="truncate font-medium text-sm">{userName}</p>
                <p className="truncate text-muted text-xs max-w-[16em]">{userEmail}</p>
                {organizationName ? (
                  <p className="truncate text-muted text-xs">{organizationName}</p>
                ) : null}
              </div>
            </DropdownItem>
          </DropdownSection>
          <DropdownSection>
            {showHomeLink ? (
              <DropdownItem onAction={() => void router.push("/")}>
                <HouseIcon className="mr-2 size-4" />
                返回首页
              </DropdownItem>
            ) : null}
            <DropdownItem className="text-danger" onAction={handleSignOut}>
              <LogOutIcon className="mr-2 size-4" />
              退出登录
            </DropdownItem>
          </DropdownSection>
        </DropdownMenu>
      </DropdownPopover>
    );

    content = collapsed ? (
      <Dropdown>
        <DropdownTrigger
          aria-label="用户菜单"
          className="flex h-10 w-full items-center justify-center rounded-full transition-colors outline-none hover:bg-default focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Avatar size="sm">
            <AvatarImage alt={userName} src={session.user.image ?? undefined} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </DropdownTrigger>
        {menuContent}
      </Dropdown>
    ) : (
      <Dropdown>
        <DropdownTrigger className="flex w-full items-center gap-2 rounded-full p-1 text-left transition-colors outline-none hover:bg-default focus-visible:ring-2 focus-visible:ring-focus">
          <Avatar size="md">
            <AvatarImage alt={userName} src={session.user.image ?? undefined} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate font-medium text-sm">{userName}</p>
            <p className="truncate text-muted text-xs">{organizationName ?? userEmail}</p>
          </div>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted" />
        </DropdownTrigger>
        {menuContent}
      </Dropdown>
    );
  } else {
    content = collapsed ? (
      <Link
        aria-label="登录"
        className={buttonClass({ className: "w-full", isIconOnly: true, variant: "ghost" })}
        href={`/login?callbackURL=${encodeURIComponent(callbackURL)}`}
      >
        <UserIcon className="size-4" />
      </Link>
    ) : (
      <div className="flex w-full flex-col gap-2">
        <FeishuSignInButton callbackURL={callbackURL} />
        <FeishuSignInButton
          variant="primary"
          callbackURL={callbackURL}
          label="极光 HR 飞书登录"
          providerId="feishu-jiguang-hr"
        />
      </div>
    );
  }

  return (
    <div className="border-separator/65 border-t px-2 py-2">
      {collapsed ? content : <div className="flex items-center gap-2">{content}</div>}
    </div>
  );
}
