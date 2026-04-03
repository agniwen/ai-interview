import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Studio',
    template: '%s | Studio',
  },
  description: 'Studio 管理后台。',
};

export default function StudioRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return children;
}
