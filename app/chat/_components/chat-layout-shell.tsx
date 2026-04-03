'use client';

import type { ReactNode } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { isMobileSidebarOpenAtom } from '../atoms/sidebar';
import ChatSidebar from './chat-sidebar';

export default function ChatLayoutShell({
  children,
}: {
  children: ReactNode
}) {
  const isMobileSidebarOpen = useAtomValue(isMobileSidebarOpenAtom);
  const setIsMobileSidebarOpen = useSetAtom(isMobileSidebarOpenAtom);

  return (
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

      <ChatSidebar />
      <main className='min-w-0 flex-1' id='main-content'>
        {children}
      </main>
    </div>
  );
}
