'use client';

import { useAtom } from 'jotai';
import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useViewTransitionReady } from '@/hooks/use-view-transition-ready';
import { hasSeenResourceNoticeAtom } from '../atoms/notice';

export function ResourceNoticeDialog() {
  const [hasSeen, setHasSeen] = useAtom(hasSeenResourceNoticeAtom);
  const transitionReady = useViewTransitionReady();
  const open = transitionReady && !hasSeen;

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) {
          setHasSeen(true);
        }
      }}
      open={open}
    >
      <DialogContent className='max-w-md rounded-2xl' overlayClassName='!bg-white/50'>
        <DialogHeader className='space-y-3'>
          <DialogTitle className='flex items-center gap-2'>
            <AlertTriangleIcon className='size-5 text-amber-500' />
            使用提示
          </DialogTitle>
          <DialogDescription className='text-sm leading-relaxed'>
            当前系统受限于服务器资源和大模型调用负载，可能在高峰时段出现响应变慢或连接中断的情况。建议：
          </DialogDescription>
        </DialogHeader>

        <ul className='space-y-2 px-1 text-sm text-muted-foreground'>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>1</span>
            <span>单次上传的简历 PDF 尽量控制在合理大小范围内</span>
          </li>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>2</span>
            <span>单次对话的连接时长有限（约 300 秒），请合理安排提问节奏</span>
          </li>
          <li className='flex gap-2'>
            <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 font-medium text-amber-600 text-[10px]'>3</span>
            <span>如遇到响应异常，可刷新页面后重试</span>
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
