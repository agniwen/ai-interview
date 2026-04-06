import type { CSSProperties, ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SiteHeader } from '@/app/studio/_components/site-header';
import { AppSidebar } from '@/app/studio/_components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { auth } from '@/lib/auth';
import { isAdminRole } from '@/lib/auth-roles';

export default async function StudioProtectedLayout({
  children,
}: {
  children: ReactNode
}) {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !isAdminRole(session.user.role)) {
    redirect('/');
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AppSidebar user={session.user} variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
