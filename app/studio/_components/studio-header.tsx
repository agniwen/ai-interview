'use client';

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

const routeMeta = {
  '/studio': {
    title: '控制台概览',
    description: '查看后台入口、权限状态与管理工作流。',
  },
  '/studio/users': {
    title: '用户与角色',
    description: '统一查看后台账号、角色说明与访问边界。',
  },
  '/studio/interviews': {
    title: 'AI 面试管理',
    description: '管理候选人面试记录、解析结果与 AI 题目。',
  },
  '/studio/settings': {
    title: '后台设置',
    description: '集中维护鉴权、路由守卫与访问策略。',
  },
} as const;

function getRouteMeta(pathname: string) {
  if (pathname.startsWith('/studio/settings')) {
    return routeMeta['/studio/settings'];
  }

  if (pathname.startsWith('/studio/interviews')) {
    return routeMeta['/studio/interviews'];
  }

  if (pathname.startsWith('/studio/users')) {
    return routeMeta['/studio/users'];
  }

  return routeMeta['/studio'];
}

export function StudioHeader() {
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);

  return (
    <header className='sticky top-0 z-20 border-b border-border/60 bg-background/92 backdrop-blur'>
      <div className='flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-6'>
        <div className='flex min-w-0 items-center gap-3'>
          <SidebarTrigger className='-ml-1' />
          <Separator className='h-4' orientation='vertical' />
          <div className='min-w-0'>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className='text-muted-foreground'>Studio</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{meta.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <p className='truncate text-muted-foreground text-sm'>{meta.description}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
