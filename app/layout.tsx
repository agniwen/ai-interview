import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import {
  IBM_Plex_Mono,
  Noto_Sans_SC,
  Source_Sans_3,
  Source_Serif_4,
} from 'next/font/google';
import localFont from 'next/font/local';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

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
  src: '../public/fonts/fusion-pixel-12px-proportional-zh_hans.ttf.woff2',
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
    <html lang='zh-CN'>
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
          {children}
          <Toaster />
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
