'use client';

import type { ComponentProps } from 'react';
import {
  ArrowLeftIcon,
  BotIcon,
  ChevronsUpDownIcon,
  CircleHelpIcon,
  LogOutIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    organizationName?: string | null
  } | null
  onStartTutorial?: () => void
}

const navItems = [
  {
    title: 'AI 面试管理',
    href: '/studio/interviews',
    icon: BotIcon,
  },
];

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? '').trim();

  if (!source) {
    return 'AD';
  }

  return source.slice(0, 2).toUpperCase();
}

export function AppSidebar({ user, onStartTutorial, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <Sidebar collapsible='icon' {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size='lg'>
              <Link href='/studio/interviews'>
                <div className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/80 text-primary-foreground'>
                  <BotIcon className='size-4' />
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-semibold'>Studio</span>
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
              {navItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
                  size='lg'
                >
                  <Avatar className='size-8 rounded-lg'>
                    <AvatarImage alt={user?.name ?? 'Admin'} src={user?.image ?? undefined} />
                    <AvatarFallback className='rounded-lg'>
                      {getInitials(user?.name, user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className='grid flex-1 text-left text-sm leading-tight'>
                    <span className='truncate font-semibold'>{user?.name ?? '管理员'}</span>
                    <span className='truncate text-xs'>{user?.email ?? ''}</span>
                  </div>
                  <ChevronsUpDownIcon className='ml-auto size-4' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align='end'
                className='w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg'
                side='bottom'
                sideOffset={4}
              >
                <DropdownMenuLabel className='p-0 font-normal'>
                  <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
                    <Avatar className='size-8 rounded-lg'>
                      <AvatarImage alt={user?.name ?? 'Admin'} src={user?.image ?? undefined} />
                      <AvatarFallback className='rounded-lg'>
                        {getInitials(user?.name, user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className='grid flex-1 text-left text-sm leading-tight'>
                      <span className='truncate font-semibold'>{user?.name ?? '管理员'}</span>
                      <span className='truncate text-xs'>{user?.email ?? ''}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                {user?.organizationName
                  ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className='text-muted-foreground text-xs'>
                          组织：
                          {user.organizationName}
                        </DropdownMenuLabel>
                      </>
                    )
                  : null}
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {onStartTutorial
                    ? (
                        <DropdownMenuItem onClick={onStartTutorial}>
                          <CircleHelpIcon />
                          使用教程
                        </DropdownMenuItem>
                      )
                    : null}
                  <DropdownMenuItem asChild>
                    <Link href='/'>
                      <ArrowLeftIcon />
                      返回首页
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await authClient.signOut();
                    router.replace('/');
                  }}
                >
                  <LogOutIcon />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

    </Sidebar>
  );
}
