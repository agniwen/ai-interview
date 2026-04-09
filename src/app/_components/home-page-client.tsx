'use client';

import {
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  FileSearch2Icon,
  MessageCircleMoreIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SignInRequiredDialog } from '@/components/auth/sign-in-required-dialog';
import { FadeContent } from '@/components/react-bits/fade-content';
import Prism from '@/components/react-bits/prism';
import { SplitText } from '@/components/react-bits/split-text';
import { Button } from '@/components/ui/button';

import { authClient } from '@/lib/auth-client';

const highlights = [
  {
    title: '聊天式简历初筛',
    description: '支持一次上传多份 PDF 简历，围绕岗位要求持续追问并输出筛选建议。',
    icon: FileSearch2Icon,
  },
  {
    title: '岗位语境驱动',
    description: '输入 JD 或筛选要求后，评估会围绕真实招聘语境展开，而不只是匹配关键词。',
    icon: BriefcaseBusinessIcon,
  },
  {
    title: '语音模拟面试',
    description: '发起实时语音面试，查看追问过程、候选人作答节奏与现场记录。',
    icon: ShieldCheckIcon,
  },
  {
    title: '筛选到面试联动',
    description: '从简历初筛到模拟面试使用同一套交互体验，让判断过程更连续。',
    icon: MessageCircleMoreIcon,
  },
];

export default function HomePageClient() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const callbackURL = useMemo(() => pendingPath ?? '/chat', [pendingPath]);

  const handleProtectedNavigation = (href: string) => {
    if (isPending) {
      return;
    }

    if (session?.user) {
      router.push(href);
      return;
    }

    setPendingPath(href);
  };

  const handleInterviewClick = () => {
    handleProtectedNavigation('/studio/interviews');
  };

  return (
    <>
      <div aria-hidden='true' className='pointer-events-none fixed  inset-0 -z-20 overflow-hidden'>
        <Prism
          height={5}
          baseWidth={7.5}
          animationType='hover'
          glow={1}
          noise={0.2}
          transparent
          scale={3.3}
          hueShift={0}
          colorFrequency={2.5}
          hoverStrength={1}
          inertia={0.05}
          bloom={0.8}
          timeScale={0.3}
        />
      </div>
      <div
        aria-hidden='true'
        className='bg-mask pointer-events-none opacity-80 fixed inset-0 -z-10 bg-[linear-gradient(to_bottom,oklch(0.985_0.007_236.5/0.48),oklch(0.985_0.007_236.5/0.68)_42%,oklch(0.985_0.007_236.5/0.82)_100%)]'
      />

      <main
        className='relative mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-8 sm:py-14'
        id='main-content'
      >
        <section className='relative w-full px-2 py-3 text-center sm:px-4'>
          <FadeContent>
            <p className='inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1 font-medium text-primary text-xs'>
              <SparklesIcon aria-hidden='true' className='size-3' />
              招聘协作工作台
            </p>
          </FadeContent>

          <h1 className='pixel-title mt-5 mx-auto max-w-4xl text-balance font-bold text-3xl text-foreground leading-tight sm:text-5xl'>
            <SplitText text='从简历筛选到模拟面试，用同一套工作流完成候选人评估' />
          </h1>

          <FadeContent className='mt-4 mx-auto max-w-3xl' delay={0.1}>
            <p className='font-serif text-base text-muted-foreground leading-relaxed sm:text-lg'>
              现在你可以先用聊天式方式完成简历初筛，再进入实时语音模拟面试，连续查看候选人的亮点、风险、追问过程与回答表现，让招聘判断更完整。
            </p>
          </FadeContent>

          <FadeContent className='mt-7 flex flex-wrap items-center justify-center gap-3' delay={0.2}>
            <Button
              className='group rounded-xl px-5 py-3 font-semibold text-sm transition-transform duration-300 ease-out hover:-translate-y-0.5'
              disabled={isPending}
              onClick={() => handleProtectedNavigation('/chat')}
              type='button'
            >
              进入简历筛选
              <ArrowRightIcon
                aria-hidden='true'
                className='size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5'
              />
            </Button>
            <Button
              className='rounded-xl bg-card/70 px-5 py-3 ring-1 ring-border/70 font-medium text-foreground text-sm transition-colors transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:bg-card'
              disabled={isPending}
              onClick={handleInterviewClick}
              type='button'
              variant='outline'
            >
              进入模拟面试
            </Button>
          </FadeContent>

          <div className='mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4' id='features'>
            {highlights.map((item, index) => {
              const Icon = item.icon;

              return (
                <FadeContent
                  className='group relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-transparent bg-transparent p-6 text-center shadow-none ring-0 backdrop-blur-0 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/55 hover:bg-white/32 hover:shadow-[0_24px_50px_-34px_rgba(32,76,140,0.7)] hover:ring-white/35 hover:backdrop-blur-xl'
                  delay={0.34 + index * 0.1}
                  key={item.title}
                >
                  <div className='relative inline-flex size-10 items-center justify-center rounded-full border border-white/50 bg-white/40 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-transform duration-300 ease-out group-hover:-translate-y-0.5'>
                    <Icon aria-hidden='true' className='size-5' />
                  </div>
                  <h3 className='relative mt-3 font-semibold text-xs text-foreground sm:text-sm'>
                    {item.title}
                  </h3>
                  <p className='relative mx-auto mt-1.5 max-w-[26ch] text-[11px] text-foreground/75 leading-relaxed sm:text-xs'>
                    {item.description}
                  </p>
                </FadeContent>
              );
            })}
          </div>
        </section>
      </main>

      <SignInRequiredDialog
        callbackURL={callbackURL}
        onOpenChange={open => !open && setPendingPath(null)}
        open={pendingPath !== null}
        title={pendingPath === '/studio/interviews' ? '登录后即可进入模拟面试管理' : '登录后即可进入简历筛选'}
      />

    </>
  );
}
