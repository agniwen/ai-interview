'use client';

import { useAtom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { AlertTriangleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface QuotaInfo {
  tier: string
  characterCount: number
  characterLimit: number
  characterRemaining: number
  nextResetUnix: number | null
  status: string
}

const sessionStore = createJSONStorage<boolean>(() => sessionStorage);
const hasSeenInterviewNoticeAtom = atomWithStorage('interview-quota-notice-seen', false, sessionStore);

const resetDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function InterviewQuotaNotice() {
  const [hasSeen, setHasSeen] = useAtom(hasSeenInterviewNoticeAtom);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasResolved, setHasResolved] = useState(hasSeen);

  useEffect(() => {
    if (hasSeen) {
      return;
    }

    fetch('/api/interview/quota', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          return null;
        }

        return response.json() as Promise<QuotaInfo>;
      })
      .then((data) => {
        if (data) {
          setIsAdmin(true);
          setQuota(data);
        }
      })
      .catch(() => undefined)
      .finally(() => setHasResolved(true));
  }, [hasSeen]);

  if (!hasResolved || !isAdmin || !quota || hasSeen) {
    return null;
  }

  const open = isAdmin && !hasSeen;
  const usagePercent = quota
    ? Math.round((quota.characterCount / quota.characterLimit) * 100)
    : null;
  const isLow = quota
    ? quota.characterRemaining / quota.characterLimit <= 0.2
    : false;

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) {
          setHasSeen(true);
        }
      }}
      open={open}
    >
      <DialogContent className='max-w-md rounded-2xl'>
        <DialogHeader className='space-y-3'>
          <DialogTitle className='flex items-center gap-2'>
            <AlertTriangleIcon className='size-5 text-amber-500' />
            面试通话用量提示
          </DialogTitle>
          <DialogDescription className='text-sm leading-relaxed'>
            AI 面试通话功能会消耗 Token 限额，以下是当前用量情况：
          </DialogDescription>
        </DialogHeader>

        {quota
          ? (
              <div className='space-y-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3'>
                <div className='flex items-baseline justify-between text-sm'>
                  <span className='text-muted-foreground'>已使用 / 总额</span>
                  <span className='font-medium'>
                    {quota.characterCount.toLocaleString()}
                    {' / '}
                    {quota.characterLimit.toLocaleString()}
                  </span>
                </div>
                <div className='h-2.5 overflow-hidden rounded-full bg-muted/70'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      isLow ? 'bg-destructive' : 'bg-primary',
                    )}
                    style={{ width: `${Math.max(2, usagePercent ?? 0)}%` }}
                  />
                </div>
                <div className='flex items-baseline justify-between text-xs text-muted-foreground'>
                  <span>
                    {'剩余 '}
                    <span className={cn('font-medium', isLow && 'text-destructive')}>
                      {quota.characterRemaining.toLocaleString()}
                    </span>
                    {' tokens'}
                  </span>
                  <span>
                    {quota.nextResetUnix
                      ? `重置于 ${resetDateFormatter.format(new Date(quota.nextResetUnix * 1000))}`
                      : ''}
                  </span>
                </div>
              </div>
            )
          : (
              <div className='flex items-center justify-center py-4'>
                <p className='text-muted-foreground text-sm'>正在加载用量数据...</p>
              </div>
            )}

        <ul className='space-y-2 px-1 text-sm text-muted-foreground'>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>1</span>
            <span>每次面试通话会按实际对话内容消耗 Token 额度</span>
          </li>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>2</span>
            <span>额度用尽后将无法发起新的面试通话，请合理安排</span>
          </li>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>3</span>
            <span>额度会在计费周期结束后自动重置</span>
          </li>
        </ul>

        <DialogFooter>
          <Button className='w-full' onClick={() => setHasSeen(true)} type='button'>
            我知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
