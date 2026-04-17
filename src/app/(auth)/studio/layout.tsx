import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AppSidebarWithTutorial } from '@/app/(auth)/studio/_components/app-sidebar-with-tutorial';
import { SiteHeader } from '@/app/(auth)/studio/_components/site-header';
import { StudioThemeScope } from '@/app/(auth)/studio/_components/studio-theme-scope';
import { StudioTutorialProvider } from '@/app/(auth)/studio/_components/studio-tutorial-provider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { auth } from '@/lib/auth';
import { canAccessAdmin } from '@/lib/auth-roles';

export const metadata: Metadata = {
  title: {
    default: 'Studio',
    template: '%s | Studio',
  },
  description: 'Studio 管理后台。',
};

export default async function StudioLayout({
  children,
}: {
  children: ReactNode
}) {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  if (!canAccessAdmin(session.user)) {
    redirect('/studio-unauthorized');
  }

  return (
    <StudioTutorialProvider>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as CSSProperties
        }
      >
        <StudioThemeScope />
        <AppSidebarWithTutorial user={session.user} variant='inset' />
        <SidebarInset className='studio-surface bg-background'>
          <SiteHeader />
          <div className='flex flex-1 flex-col '>
            <div className='@container/main   rounded-lg flex flex-1 flex-col gap-2 bg-background'>
              <div className='flex flex-col gap-4 bg-background px-4 py-4 md:gap-6 md:px-6 md:py-6'>
                {children}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </StudioTutorialProvider>
  );
}
