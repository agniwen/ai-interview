'use client';

import {
  FileTextIcon,
  HouseIcon,
  LoaderCircleIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SparklesIcon,
  UploadIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation';
import { PromptInput, PromptInputBody, PromptInputFooter } from '@/components/ai-elements/prompt-input';
import { ElevenLabsQuota } from '@/components/interview/elevenlabs-quota';
import { InterviewQuotaNotice } from '@/components/interview/interview-quota-notice';
import { SidebarUserSection } from '@/components/sidebar-user-section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type UploadStage = 'idle' | 'uploading' | 'error';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function InterviewQuickStartClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useHotkeys('meta+b', (event) => {
    event.preventDefault();
    setIsSidebarCollapsed(value => !value);
  });

  const showExpandedSidebar = !isSidebarCollapsed || isMobileSidebarOpen;

  const handleUpload = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setErrorMessage('仅支持 PDF 格式的简历文件。');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('文件大小不能超过 10 MB。');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setUploadStage('uploading');
    setUploadProgress('正在解析简历并生成面试题...');

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/interview/quick-start', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? '简历解析失败，请重试。');
      }

      const data = (await response.json()) as { interviewId: string, roundId: string };
      setUploadProgress('解析完成，正在跳转...');
      router.push(`/interview/${data.interviewId}/${data.roundId}`);
    }
    catch (error) {
      setUploadStage('error');
      setErrorMessage(error instanceof Error ? error.message : '简历解析失败，请重试。');
    }
  }, [router]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      void handleUpload(file);
    }

    event.target.value = '';
  }, [handleUpload]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];

    if (file) {
      void handleUpload(file);
    }
  }, [handleUpload]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const isUploading = uploadStage === 'uploading';

  return (
    <div className='flex h-dvh w-full overflow-hidden bg-transparent'>
      {isMobileSidebarOpen
        ? (
            <button
              aria-label='关闭侧边栏'
              className='fixed inset-0 z-30 bg-black/18 backdrop-blur-[1px] sm:hidden'
              onClick={() => setIsMobileSidebarOpen(false)}
              type='button'
            />
          )
        : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[min(82vw,20rem)] shrink-0 flex-col overflow-hidden border-r border-border/75 bg-card/95 shadow-[0_14px_36px_-32px_rgba(52,96,168,0.6)] backdrop-blur-sm transition-transform duration-200 sm:static sm:z-auto sm:bg-card/80 sm:transition-[width]',
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
          isSidebarCollapsed ? 'sm:w-14' : 'sm:w-72',
        )}
        id='interview-sidebar'
      >
        <div className='flex items-center gap-1 border-border/65 border-b px-2 py-2'>
          <Button
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            className='hidden sm:inline-flex'
            onClick={() => setIsSidebarCollapsed(value => !value)}
            size='icon'
            type='button'
            variant='ghost'
          >
            {isSidebarCollapsed
              ? <PanelLeftOpenIcon className='size-4' />
              : <PanelLeftCloseIcon className='size-4' />}
          </Button>

          {showExpandedSidebar
            ? (
                <>
                  <p className='truncate font-medium text-sm'>快速开始面试</p>
                  <Button asChild className='ml-auto' size='icon' type='button' variant='ghost'>
                    <Link aria-label='返回首页' href='/'>
                      <HouseIcon className='size-4' />
                    </Link>
                  </Button>
                </>
              )
            : null}

          <Button
            aria-label='关闭侧边栏'
            className={cn(showExpandedSidebar ? 'sm:hidden' : 'ml-auto sm:hidden')}
            onClick={() => setIsMobileSidebarOpen(false)}
            size='icon'
            type='button'
            variant='ghost'
          >
            <PanelLeftCloseIcon className='size-4' />
          </Button>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-3 py-3'>
          {!showExpandedSidebar
            ? null
            : (
                <>
                  <section className='border-border/60 border-b py-3'>
                    <p className='mb-3 font-medium text-sm'>上传候选人简历</p>
                    <p className='mb-4 text-muted-foreground text-xs leading-relaxed'>
                      上传一份 PDF 简历，系统会自动解析候选人信息并生成面试题，完成后立即进入面试。
                    </p>

                    <input
                      accept='application/pdf'
                      className='hidden'
                      onChange={handleFileSelect}
                      ref={fileInputRef}
                      type='file'
                    />

                    <div
                      className={cn(
                        'relative rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                        isDragOver
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40',
                        isUploading && 'pointer-events-none opacity-60',
                      )}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      {isUploading
                        ? (
                            <div className='flex flex-col items-center gap-2'>
                              <LoaderCircleIcon className='size-8 animate-spin text-primary/70' />
                              <p className='font-medium text-sm'>{uploadProgress}</p>
                              {selectedFile
                                ? <p className='text-muted-foreground text-xs'>{selectedFile.name}</p>
                                : null}
                            </div>
                          )
                        : (
                            <div className='flex flex-col items-center gap-2'>
                              <UploadIcon className='size-8 text-muted-foreground/60' />
                              <p className='font-medium text-sm'>拖拽 PDF 到这里</p>
                              <p className='text-muted-foreground text-xs'>或点击下方按钮选择文件</p>
                            </div>
                          )}
                    </div>

                    <Button
                      className='mt-3 w-full'
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      type='button'
                      variant='outline'
                    >
                      <FileTextIcon className='size-4' />
                      选择 PDF 简历
                    </Button>

                    {errorMessage
                      ? (
                          <div className='mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>
                            {errorMessage}
                          </div>
                        )
                      : null}
                  </section>

                  <section className='py-3'>
                    <p className='mb-3 font-medium text-sm'>使用说明</p>
                    <div className='space-y-3 text-muted-foreground text-xs leading-relaxed'>
                      <div className='flex gap-2'>
                        <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-[10px]'>1</span>
                        <p>上传候选人的 PDF 简历（不超过 10 MB）</p>
                      </div>
                      <div className='flex gap-2'>
                        <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-[10px]'>2</span>
                        <p>系统自动解析简历、提取候选人信息并生成面试题</p>
                      </div>
                      <div className='flex gap-2'>
                        <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-[10px]'>3</span>
                        <p>解析完成后自动跳转到面试页面，点击"开始面试"即可发起语音面试</p>
                      </div>
                    </div>
                  </section>

                  <ElevenLabsQuota />
                </>
              )}
        </div>

        <SidebarUserSection callbackURL='/interview' collapsed={isSidebarCollapsed && !isMobileSidebarOpen} />
      </aside>

      <section className='flex min-w-0 flex-1 flex-col bg-transparent'>
        <div className='mx-auto flex h-full w-full max-w-5xl min-w-0 flex-col px-1 pb-2 pt-4 sm:px-2 sm:pb-4 sm:pt-6'>
          <header className='px-1'>
            <div className='mb-2 flex items-center gap-2 sm:hidden'>
              <Button
                aria-controls='interview-sidebar'
                aria-expanded={isMobileSidebarOpen}
                onClick={() => setIsMobileSidebarOpen(true)}
                size='sm'
                type='button'
                variant='outline'
              >
                <PanelLeftOpenIcon className='mr-1 size-4' />
                上传简历
              </Button>
            </div>

            <div className='flex flex-wrap items-center gap-3'>
              <h1 className='pixel-title text-balance font-bold tracking-tight text-2xl sm:text-3xl'>AI 面试</h1>
            </div>
            <p className='mt-2 max-w-3xl font-serif! text-xs text-muted-foreground sm:text-sm'>
              上传候选人简历，系统自动解析并生成面试题，即刻开始语音面试
            </p>
          </header>

          <div className='relative mt-4 min-h-0 flex-1 overflow-hidden'>
            <Conversation className='h-full'>
              <ConversationContent className='gap-6 px-0 py-4 sm:py-6'>
                <ConversationEmptyState
                  className='my-10 rounded-2xl border border-dashed border-border/70 bg-background/70'
                  description={
                    isUploading
                      ? '正在解析简历并生成面试题，请稍候...'
                      : '在左侧边栏上传候选人 PDF 简历，系统会自动解析并创建面试，完成后自动跳转到面试页面。'
                  }
                  icon={
                    isUploading
                      ? <LoaderCircleIcon className='size-5 animate-spin' />
                      : <SparklesIcon className='size-5' />
                  }
                  title={isUploading ? '正在准备面试' : '上传简历开始面试'}
                />
              </ConversationContent>
            </Conversation>
          </div>

          <div className='mt-4 px-1'>
            <PromptInput
              className='**:data-[slot=input-group]:rounded-[1.3rem] **:data-[slot=input-group]:border-border/65 **:data-[slot=input-group]:bg-white **:data-[slot=input-group]:shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]'
              onSubmit={() => undefined}
            >
              <PromptInputBody>
                <div className='w-full px-3 pb-2 pt-3'>
                  <div
                    className={cn(
                      'flex items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                      isDragOver
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border/60 bg-muted/20',
                      isUploading && 'pointer-events-none opacity-60',
                    )}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    {isUploading
                      ? (
                          <div className='flex items-center gap-3'>
                            <LoaderCircleIcon className='size-5 animate-spin text-primary/70' />
                            <p className='font-medium text-sm'>{uploadProgress}</p>
                          </div>
                        )
                      : (
                          <div className='flex items-center gap-3'>
                            <UploadIcon className='size-5 text-muted-foreground/60' />
                            <p className='text-muted-foreground text-sm'>将 PDF 简历拖到这里，或在侧边栏中上传</p>
                          </div>
                        )}
                  </div>
                </div>
              </PromptInputBody>

              <PromptInputFooter className='px-3 pb-3 pt-1'>
                <p className='text-muted-foreground text-xs'>上传后系统会自动完成简历解析、面试题生成，并跳转到面试页面。</p>
                <Button
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  type='button'
                >
                  <UploadIcon className='size-4' />
                  上传简历开始
                </Button>
              </PromptInputFooter>
            </PromptInput>

            {errorMessage && uploadStage === 'error'
              ? (
                  <p aria-live='polite' className='mt-2 px-1 text-destructive text-sm'>
                    {errorMessage}
                  </p>
                )
              : null}
          </div>
        </div>
      </section>

      <InterviewQuotaNotice />
    </div>
  );
}
