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

const routeTitles: Record<string, string> = {
  '/studio': '概览',
  '/studio/users': '用户与角色',
  '/studio/interviews': 'AI 面试管理',
  '/studio/settings': '后台设置',
};

function getRouteTitle(pathname: string) {
  for (const [prefix, title] of Object.entries(routeTitles)) {
    if (prefix !== '/studio' && pathname.startsWith(prefix)) {
      return title;
    }
  }

  if (pathname === '/studio') {
    return routeTitles['/studio'];
  }

  return '概览';
}

export function SiteHeader() {
  const pathname = usePathname();
  const title = getRouteTitle(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mx-2 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              Studio
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
