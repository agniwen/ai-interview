'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { ChatLayoutAnimationContext } from '@/hooks/use-page-enter-animation';

import { isMobileSidebarOpenAtom } from '../atoms/sidebar';
import ChatSidebar from './chat-sidebar';

export default function ChatLayoutShell({
  children,
}: {
  children: ReactNode
}) {
  const isMobileSidebarOpen = useAtomValue(isMobileSidebarOpenAtom);
  const setIsMobileSidebarOpen = useSetAtom(isMobileSidebarOpenAtom);
  const sidebarRef = useRef<HTMLDivElement>(null);

  return (
    <ChatLayoutAnimationContext value={sidebarRef}>
      <div className='flex h-dvh w-full gap-3 pr-3 sm:pr-6'>
        {isMobileSidebarOpen
          ? (
              <button
                aria-label='关闭聊天记录侧边栏'
                className='fixed inset-0 z-30 bg-black/18 backdrop-blur-[1px] sm:hidden'
                onClick={() => setIsMobileSidebarOpen(false)}
                type='button'
              />
            )
          : null}

        <ChatSidebar ref={sidebarRef} />
        <main className='min-w-0 flex-1' id='main-content'>
          {children}
        </main>
      </div>
    </ChatLayoutAnimationContext>
  );
}
