'use client';

import type { ComponentProps } from 'react';
import { BotIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarUserSection } from '@/components/sidebar-user-section';
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
  useSidebar,
} from '@/components/ui/sidebar';

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  onStartTutorial?: () => void
}

const navItems = [
  {
    title: 'AI 面试管理',
    href: '/studio/interviews',
    icon: BotIcon,
  },
];

export function AppSidebar({ onStartTutorial, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { state } = useSidebar();

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

      <SidebarFooter className='p-0'>
        <SidebarUserSection
          callbackURL='/studio'
          collapsed={state === 'collapsed'}
          onStartTutorial={onStartTutorial}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
