"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/shared/auth-client";

interface UserMenuProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  initials: string;
}

export function UserMenu({ name, email, avatarUrl, initials }: UserMenuProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = useCallback(async () => {
    setPending(true);
    try {
      await authClient.signOut();
      router.replace("/login");
    } catch {
      setPending(false);
    }
  }, [router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 gap-2 px-2" type="button" variant="ghost">
          <Avatar className="size-7">
            <AvatarImage alt={name} src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[8rem] truncate text-sm sm:block">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate font-medium text-sm">{name}</p>
          <p className="truncate text-muted-foreground text-xs">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={handleSignOut} variant="destructive">
          <LogOutIcon className="mr-2 size-4" />
          {pending ? "退出中..." : "退出登录"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
