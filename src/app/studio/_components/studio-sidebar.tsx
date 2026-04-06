'use client';

import type { RoleValue } from '@/lib/auth-roles';
import {
  ArrowLeftIcon,
  BotIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { getRoleList } from '@/lib/auth-roles';

interface StudioSidebarProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: RoleValue
  } | null
}

const primaryNavItems = [
  {
    title: '概览',
    href: '/studio',
    icon: LayoutDashboardIcon,
  },
  {
    title: 'AI 面试管理',
    href: '/studio/interviews',
    icon: BotIcon,
  },
  {
    title: '用户与角色',
    href: '/studio/users',
    icon: UsersIcon,
  },
  {
    title: '后台设置',
    href: '/studio/settings',
    icon: Settings2Icon,
  },
];

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? '').trim();

  if (!source) {
    return 'AD';
  }

  return source.slice(0, 2).toUpperCase();
}

export function StudioSidebar({ user }: StudioSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const roles = getRoleList(user?.role);

  const isActiveItem = (href: string) => {
    if (href === '/studio') {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <Sidebar collapsible='icon' variant='inset'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size='lg'>
              <Link href='/studio'>
                <div className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
                  <ShieldCheckIcon className='size-4' />
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                  <span className='truncate font-semibold'>Studio Admin</span>
                  <span className='truncate text-muted-foreground text-xs'>管理后台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActiveItem(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.href}>
                        <Icon className='size-4' />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className='group-data-[collapsible=icon]:hidden'>
          <SidebarGroupLabel>权限状态</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className='rounded-xl border border-sidebar-border/70 bg-sidebar-accent/35 p-3 text-sidebar-foreground'>
              <p className='font-medium text-sm'>当前访问已受 layout 鉴权保护</p>
              <p className='mt-1 text-sidebar-foreground/75 text-xs leading-relaxed'>
                仅 `admin` 角色可进入 `studio/(auth)` 下的页面，非管理员会直接跳转到首页。
              </p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className='rounded-xl border border-sidebar-border/70 bg-sidebar/70 p-3 group-data-[collapsible=icon]:hidden'>
          <div className='flex items-center gap-3'>
            <Avatar className='size-9 rounded-lg'>
              <AvatarImage alt={user?.name ?? 'Admin'} src={user?.image ?? undefined} />
              <AvatarFallback className='rounded-lg'>
                {getInitials(user?.name, user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 flex-1'>
              <p className='truncate font-medium text-sm'>{user?.name ?? '管理员'}</p>
              <p className='truncate text-sidebar-foreground/70 text-xs'>
                {user?.email ?? '未知邮箱'}
              </p>
            </div>
          </div>

          <div className='mt-3 flex flex-wrap gap-2'>
            {(roles.length > 0 ? roles : ['admin']).map(role => (
              <Badge className='rounded-full' key={role} variant='secondary'>
                {role}
              </Badge>
            ))}
          </div>

          <div className='mt-4 flex gap-2'>
            <Button asChild className='flex-1' size='sm' variant='outline'>
              <Link href='/'>
                <ArrowLeftIcon className='size-4' />
                返回首页
              </Link>
            </Button>
            <Button
              className='px-3'
              onClick={async () => {
                await authClient.signOut();
                router.replace('/');
              }}
              size='sm'
              type='button'
              variant='ghost'
            >
              <LogOutIcon className='size-4' />
            </Button>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
