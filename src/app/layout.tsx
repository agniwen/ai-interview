import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import {
  Geist,
  IBM_Plex_Mono,
  JetBrains_Mono,
  Noto_Sans_SC,
  Source_Sans_3,
  Source_Serif_4,
} from 'next/font/google';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sans-sc',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const fusionPixel = localFont({
  src: '../../public/fonts/fusion-pixel-12px-proportional-zh_hans.ttf.woff2',
  variable: '--font-fusion-pixel',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: '简历筛选助手',
  description:
    '面向招聘场景的聊天式简历初筛应用，支持上传简历并生成筛选建议。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='zh-CN' className={cn('font-sans dark', geist.variable, 'font-mono', jetbrainsMono.variable)}>
      <body
        className={`${sourceSans.variable} ${notoSansSC.variable} ${sourceSerif.variable} ${fusionPixel.variable} ${ibmPlexMono.variable} min-h-dvh antialiased`}
      >
        <a
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2'
          href='#main-content'
        >
          跳到主要内容
        </a>
        <TooltipProvider>
          <Suspense>
            {children}
          </Suspense>
          <Toaster />
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
