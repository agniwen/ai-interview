'use client';

import type { ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      className='toaster group'
      icons={{
        success: <CircleCheckIcon className='size-4' />,
        info: <InfoIcon className='size-4' />,
        warning: <TriangleAlertIcon className='size-4' />,
        error: <OctagonXIcon className='size-4' />,
        loading: <Loader2Icon className='size-4 animate-spin' />,
      }}
      style={{
        '--normal-bg': 'color-mix(in oklab, white 78%, transparent)',
        '--normal-text': 'oklch(0.24 0.02 248)',
        '--normal-border': 'color-mix(in oklab, white 52%, var(--border))',
        '--border-radius': '18px',
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: 'border border-white/55 bg-white/68 text-foreground shadow-[0_18px_48px_-26px_rgba(36,62,110,0.35)] backdrop-blur-xl',
          title: 'font-medium text-foreground',
          description: 'text-foreground/75',
          actionButton: 'bg-white/80 text-foreground hover:bg-white',
          cancelButton: 'bg-black/5 text-foreground hover:bg-black/10',
          closeButton: 'border-white/50 bg-white/70 text-foreground/70 hover:bg-white hover:text-foreground',
        },
      }}
      position='top-center'
      theme={theme as ToasterProps['theme']}
      {...props}
    />
  );
}

export { Toaster };
