'use client';

import type { ComponentProps } from 'react';
import { AppSidebar } from './app-sidebar';
import { useStudioTutorialContext } from './studio-tutorial-provider';

export function AppSidebarWithTutorial(props: ComponentProps<typeof AppSidebar> & {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    organizationName?: string | null
  } | null
}) {
  const { startTutorial } = useStudioTutorialContext();

  return <AppSidebar {...props} onStartTutorial={startTutorial} />;
}
