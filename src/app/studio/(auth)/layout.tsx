import type { CSSProperties, ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StudioHeader } from '@/app/studio/_components/studio-header';
import { StudioSidebar } from '@/app/studio/_components/studio-sidebar';
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
          '--sidebar-width': '17.5rem',
          '--sidebar-width-icon': '3.25rem',
        } as CSSProperties
      }
    >
      <StudioSidebar user={session.user} />
      <SidebarInset className='bg-muted/35' id='main-content'>
        <StudioHeader />
        <div className='flex flex-1 flex-col gap-6 p-4 lg:p-6'>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
