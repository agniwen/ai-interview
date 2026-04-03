'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface QuotaInfo {
  tier: string
  characterCount: number
  characterLimit: number
  characterRemaining: number
  nextResetUnix: number | null
  status: string
}

const resetDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function ElevenLabsQuota({ className }: { className?: string }) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/interview/quota', { cache: 'no-store' })
      .then((response) => {
        if (response.status === 401 || response.status === 403) {
          setFailed(true);
          return null;
        }

        return response.ok ? (response.json() as Promise<QuotaInfo>) : null;
      })
      .then((data) => {
        if (data) {
          setQuota(data);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return null;
  }

  return (
    <section className={cn('border-border/60 border-b py-3', className)}>
      <p className='mb-3 font-medium text-sm'>通话额度</p>
      {quota
        ? (
            <div className='grid gap-2 text-xs'>
              <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                <p className='text-muted-foreground'>剩余 / 总额</p>
                <p className='mt-1 font-medium text-sm'>
                  {quota.characterRemaining.toLocaleString()}
                  {' / '}
                  {quota.characterLimit.toLocaleString()}
                </p>
                <div className='mt-2 h-2 overflow-hidden rounded-full bg-muted/70'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      quota.characterRemaining / quota.characterLimit > 0.2 ? 'bg-primary' : 'bg-destructive',
                    )}
                    style={{ width: `${Math.max(2, (quota.characterRemaining / quota.characterLimit) * 100)}%` }}
                  />
                </div>
              </div>
              <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                <p className='text-muted-foreground'>已使用</p>
                <p className='mt-1 font-medium text-sm'>
                  {quota.characterCount.toLocaleString()}
                  {' tokens'}
                </p>
              </div>
              <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                <p className='text-muted-foreground'>下次重置</p>
                <p className='mt-1 font-medium text-sm'>
                  {quota.nextResetUnix
                    ? resetDateFormatter.format(new Date(quota.nextResetUnix * 1000))
                    : '暂无信息'}
                </p>
              </div>
            </div>
          )
        : (
            <p className='text-muted-foreground text-xs'>加载中...</p>
          )}
    </section>
  );
}
