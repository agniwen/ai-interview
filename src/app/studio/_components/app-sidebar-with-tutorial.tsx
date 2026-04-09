'use client';

import type { ComponentProps } from 'react';
import type { RoleValue } from '@/lib/auth-roles';
import { AppSidebar } from './app-sidebar';
import { useStudioTutorialContext } from './studio-tutorial-provider';

export function AppSidebarWithTutorial(props: ComponentProps<typeof AppSidebar> & {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: RoleValue
  } | null
}) {
  const { startTutorial } = useStudioTutorialContext();

  return <AppSidebar {...props} onStartTutorial={startTutorial} />;
}
