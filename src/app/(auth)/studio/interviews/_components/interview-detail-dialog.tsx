'use client';

import type { StudioInterviewConversationReport } from '@/lib/interview-session';
import type { StudioInterviewRecord } from '@/lib/studio-interviews';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareTextIcon, RotateCcwIcon, Share2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from '@/components/time-display';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copyTextToClipboard, toAbsoluteUrl } from '@/lib/clipboard';
import { scheduleEntryStatusMeta } from '@/lib/studio-interviews';
import { InterviewStatusBadge } from './interview-status-badge';

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter(item => typeof item === 'string' && item.trim().length > 0);
}

function ensureArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function ensureProjectExperiences(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      name?: string | null
      role?: string | null
      period?: string | null
      summary?: string | null
      techStack: string[]
    }>;
  }

  return value
    .filter(item => typeof item === 'object' && item !== null)
    .map((item) => {
      const project = item as Record<string, unknown>;

      return {
        name: typeof project.name === 'string' ? project.name : null,
        role: typeof project.role === 'string' ? project.role : null,
        period: typeof project.period === 'string' ? project.period : null,
        summary: typeof project.summary === 'string' ? project.summary : null,
        techStack: ensureStringArray(project.techStack),
      };
    });
}

function truncateText(value: string | number | null | undefined, maxLength = 320) {
  const text = formatValue(value);

  if (text === '未填写' || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function formatReportStatus(status: string) {
  switch (status) {
    case 'done':
      return '已完成';
    case 'failed':
      return '失败';
    case 'connected':
      return '进行中';
    case 'disconnected':
      return '已断开';
    case 'connecting':
      return '连接中';
    default:
      return status || '未知';
  }
}

function getReportBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'done':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'connected':
      return 'secondary';
    default:
      return 'outline';
  }
}

function renderKeyValueEntries(entries: Record<string, unknown>) {
  const items = Object.entries(entries).filter(([, value]) => value !== null && value !== undefined && value !== '');

  if (items.length === 0) {
    return <p className='text-muted-foreground text-sm'>暂无结构化结果。</p>;
  }

  return (
    <div className='space-y-2'>
      {items.map(([key, value]) => (
        <div className='rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm' key={key}>
          <p className='font-medium'>{key}</p>
          <p className='mt-1 break-words text-muted-foreground leading-relaxed'>{typeof value === 'string' ? value : JSON.stringify(value)}</p>
        </div>
      ))}
    </div>
  );
}

interface EvaluationQuestion {
  order?: number
  question?: string
  score?: number
  maxScore?: number
  assessment?: string
}

function isAgentEvaluation(data: Record<string, unknown>): data is {
  questions: EvaluationQuestion[]
  overallScore?: number
  overallAssessment?: string
  recommendation?: string
} {
  return Array.isArray(data.questions);
}

function renderEvaluationResults(data: Record<string, unknown>) {
  if (!data || Object.keys(data).length === 0) {
    return <p className='text-muted-foreground text-sm'>暂无结构化结果。</p>;
  }

  if (!isAgentEvaluation(data)) {
    return renderKeyValueEntries(data);
  }

  return (
    <div className='space-y-3'>
      {typeof data.overallScore === 'number' && (
        <div className='flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5'>
          <span className='font-semibold text-2xl'>{data.overallScore}</span>
          <span className='text-muted-foreground text-sm'>/ 100</span>
          {data.recommendation && (
            <Badge variant={data.recommendation.includes('不建议') ? 'destructive' : data.recommendation.includes('待定') ? 'secondary' : 'default'} className='ml-auto'>
              {data.recommendation}
            </Badge>
          )}
        </div>
      )}
      {data.overallAssessment && (
        <p className='text-muted-foreground text-sm leading-relaxed'>{data.overallAssessment}</p>
      )}
      {data.questions.length > 0 && (
        <div className='space-y-2'>
          {data.questions.map((q, i) => (
            <div className='rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm' key={q.order ?? i}>
              <div className='flex items-start justify-between gap-2'>
                <p className='min-w-0 font-medium leading-relaxed'>
                  {q.order != null ? `${q.order}. ` : ''}
                  {q.question ?? '未知题目'}
                </p>
                <span className='shrink-0 font-semibold'>
                  {q.score ?? '-'}
                  <span className='font-normal text-muted-foreground'>
                    /
                    {q.maxScore ?? 10}
                  </span>
                </span>
              </div>
              {q.assessment && (
                <p className='mt-1.5 text-muted-foreground leading-relaxed'>{q.assessment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  return (
    <div className='grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3'>
      <span className='pt-0.5 text-muted-foreground'>{label}</span>
      <span className={`min-w-0 break-words text-foreground leading-relaxed ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

export function InterviewDetailDialog({
  open,
  onOpenChange,
  onUpdated,
  recordId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
  recordId: string | null
}) {
  const [resettingRoundId, setResettingRoundId] = useState<string | null>(null);

  const { data: record, isLoading: isRecordLoading } = useQuery({
    queryKey: ['studio-interview', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/studio/interviews/${recordId}`);
      const payload = await response.json() as StudioInterviewRecord | { error?: string };
      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error ?? '加载详情失败' : '加载详情失败');
      }
      return payload as StudioInterviewRecord;
    },
    enabled: open && !!recordId,
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['studio-interview-reports', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/studio/interviews/${recordId}/reports`);
      const payload = await response.json() as StudioInterviewConversationReport[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(!Array.isArray(payload) ? payload.error ?? '加载面试报告失败' : '加载面试报告失败');
      }
      return payload;
    },
    enabled: open && !!recordId,
  });

  const isLoading = isRecordLoading;

  async function handleCopy(link: string) {
    try {
      const result = await copyTextToClipboard(link);

      if (result === 'copied') {
        toast.success('面试链接已复制');
        return;
      }

      if (result === 'manual') {
        toast.info('已弹出链接，请手动复制');
        return;
      }

      if (result === 'failed') {
        throw new Error('copy-failed');
      }
    }
    catch {
      toast.error('复制失败，请手动复制');
    }
  }

  async function handleResetRound(roundId: string) {
    if (!recordId || resettingRoundId) {
      return;
    }

    setResettingRoundId(roundId);

    try {
      const response = await fetch(`/api/studio/interviews/${recordId}/rounds/${roundId}/reset`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as StudioInterviewRecord | { error?: string } | null;

      if (!response.ok || !payload || 'error' in payload) {
        throw new Error(payload && 'error' in payload ? payload.error ?? '重置失败' : '重置失败');
      }

      toast.success('轮次已重置为待开始');
      onUpdated?.();
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '重置失败');
    }
    finally {
      setResettingRoundId(null);
    }
  }

  const scheduleEntries = ensureArray<StudioInterviewRecord['scheduleEntries'][number]>(record?.scheduleEntries);
  const interviewQuestions = ensureArray<StudioInterviewRecord['interviewQuestions'][number]>(record?.interviewQuestions);
  const workExperiences = ensureArray<NonNullable<StudioInterviewRecord['resumeProfile']>['workExperiences'][number]>(record?.resumeProfile?.workExperiences);
  const projectExperiences = ensureProjectExperiences(record?.resumeProfile?.projectExperiences);
  const skills = ensureStringArray(record?.resumeProfile?.skills);
  const personalStrengths = ensureStringArray(record?.resumeProfile?.personalStrengths);
  const schools = ensureStringArray(record?.resumeProfile?.schools);
  const visibleInterviewQuestions = interviewQuestions.slice(0, 20);
  const visibleWorkExperiences = workExperiences.slice(0, 12);
  const visibleProjectExperiences = projectExperiences.slice(0, 12);
  const visibleSkills = skills.slice(0, 40);
  const visiblePersonalStrengths = personalStrengths.slice(0, 20);
  const visibleSchools = schools.slice(0, 20);
  const latestReport = reports[0] ?? null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='flex max-h-[90vh] flex-col gap-0! w-[min(96vw,1440px)] max-w-none overflow-hidden p-0 sm:min-w-275'>
        <Tabs className='flex min-h-0 flex-1 flex-col' defaultValue='overview' key={recordId ?? 'empty'}>
          <DialogHeader className='border-b px-6 pt-5 pb-2'>
            <DialogTitle className='flex flex-wrap items-center gap-3'>
              <span className='break-words'>{record?.candidateName ?? '候选人详情'}</span>
              {record ? <InterviewStatusBadge status={record.status} /> : null}
            </DialogTitle>
            <DialogDescription className='wrap-break-word leading-relaxed'>
              {record
                ? (
                    <>
                      {record.targetRole ?? '待识别岗位'}
                      {' · '}
                      {record.resumeFileName ?? '未上传简历'}
                    </>
                  )
                : isLoading
                  ? '正在加载候选人详情...'
                  : '暂无可展示的候选人详情。'}
            </DialogDescription>
            {record
              ? (
                  <TabsList className='mt-0'>
                    <TabsTrigger className='min-w-[6em]' value='overview'>概览</TabsTrigger>
                    <TabsTrigger className='min-w-[6em]' value='reports'>面试报告</TabsTrigger>
                    <TabsTrigger className='min-w-[6em]' value='questions'>AI 题目</TabsTrigger>
                    <TabsTrigger className='min-w-[6em]' value='experience'>经历</TabsTrigger>
                  </TabsList>
                )
              : null}
          </DialogHeader>

          {isLoading
            ? (
                <div className='flex min-h-80 items-center justify-center px-6 py-10 text-muted-foreground text-sm'>
                  正在加载候选人详情...
                </div>
              )
            : record
              ? (
                  <div className='min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6'>

                    <TabsContent value='overview'>
                      <div className='space-y-6'>
                        <div className='rounded-2xl border border-border/60 bg-muted/30 p-5'>
                          <h3 className='font-medium text-sm'>基础信息</h3>
                          <div className='mt-4 grid gap-3 text-sm'>
                            <DetailRow label='邮箱' value={formatValue(record.candidateEmail)} />
                            <DetailRow label='目标岗位' value={formatValue(record.targetRole)} />
                            <DetailRow label='工作年限' value={formatValue(record.resumeProfile?.workYears)} />
                            <DetailRow label='年龄' value={formatValue(record.resumeProfile?.age)} />
                            <DetailRow label='性别' value={formatValue(record.resumeProfile?.gender)} />
                          </div>
                        </div>

                        <div className='rounded-2xl border border-border/60 bg-background p-5'>
                          <h3 className='font-medium text-sm'>面试安排</h3>
                          <div className='mt-4 space-y-3'>
                            {scheduleEntries.length > 0
                              ? scheduleEntries.map((entry, index) => {
                                  const statusKey = (entry.status ?? 'pending') as keyof typeof scheduleEntryStatusMeta;
                                  const statusMeta = scheduleEntryStatusMeta[statusKey] ?? scheduleEntryStatusMeta.pending;
                                  const isLastEntry = index === scheduleEntries.length - 1;
                                  const interviewLink = toAbsoluteUrl(`/interview/${record.id}/${entry.id}`);

                                  return (
                                    <div className='rounded-xl border border-border/60 bg-muted/30 p-3' key={entry.id}>
                                      <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
                                        <div className='flex items-center gap-2'>
                                          <span className='wrap-break-word font-medium text-sm'>{entry.roundLabel}</span>
                                          <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                          <TimeDisplay className='shrink-0 text-muted-foreground text-xs' options={DATE_TIME_DISPLAY_OPTIONS} value={entry.scheduledAt} />
                                          <Button
                                            onClick={() => void handleCopy(interviewLink)}
                                            size='sm'
                                            type='button'
                                            variant='ghost'
                                          >
                                            <Share2Icon className='size-3.5' />
                                            复制链接
                                          </Button>
                                          {isLastEntry && entry.status === 'completed'
                                            ? (
                                                <Button
                                                  disabled={resettingRoundId === entry.id}
                                                  onClick={() => void handleResetRound(entry.id)}
                                                  size='sm'
                                                  type='button'
                                                  variant='outline'
                                                >
                                                  <RotateCcwIcon className='size-3.5' />
                                                  {resettingRoundId === entry.id ? '重置中...' : '重置轮次'}
                                                </Button>
                                              )
                                            : null}
                                        </div>
                                      </div>
                                      <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                                        {truncateText(entry.notes, 180) || '暂无轮次备注'}
                                      </p>
                                      <div className='mt-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2'>
                                        <p className='text-muted-foreground text-xs'>完整面试链接</p>
                                        <p className='mt-1 break-all font-mono text-xs leading-relaxed'>
                                          {interviewLink}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })
                              : <p className='text-muted-foreground text-sm'>暂无面试安排。</p>}
                          </div>
                        </div>

                        <div className='rounded-2xl border border-border/60 bg-background p-5'>
                          <h3 className='font-medium text-sm'>技能与优势</h3>
                          <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                            技能：
                            <span className='wrap-break-word'>{visibleSkills.join('、') || '未发现信息'}</span>
                          </p>
                          <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                            优势：
                            <span className='wrap-break-word'>{visiblePersonalStrengths.join('、') || '未发现信息'}</span>
                          </p>
                          <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                            学校：
                            <span className='wrap-break-word'>{visibleSchools.join('、') || '未发现信息'}</span>
                          </p>
                        </div>

                        <div className='rounded-2xl border border-border/60 bg-background p-5'>
                          <h3 className='font-medium text-sm'>备注</h3>
                          <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                            {truncateText(record.notes, 600) || '暂无备注'}
                          </p>
                        </div>

                        <div className='rounded-2xl border border-border/60 bg-background p-5'>
                          <div className='flex items-center justify-between gap-3'>
                            <h3 className='font-medium text-sm'>最近一次面试结果</h3>
                            <Badge variant={latestReport ? getReportBadgeVariant(latestReport.status) : 'outline'}>
                              {latestReport ? formatReportStatus(latestReport.status) : '暂无报告'}
                            </Badge>
                          </div>
                          <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                            {latestReport?.transcriptSummary ?? '候选人完成面试后，这里会显示通话总结。'}
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value='reports'>
                      <div className='space-y-6'>
                        <div className='grid gap-4 md:grid-cols-4'>
                          <div className='rounded-2xl border border-border/60 bg-background p-4'>
                            <p className='text-muted-foreground text-xs'>面试次数</p>
                            <p className='mt-2 font-semibold text-2xl'>{reports.length}</p>
                          </div>
                          <div className='rounded-2xl border border-border/60 bg-background p-4'>
                            <p className='text-muted-foreground text-xs'>已完成</p>
                            <p className='mt-2 font-semibold text-2xl'>{reports.filter(report => report.status === 'done').length}</p>
                          </div>
                          <div className='rounded-2xl border border-border/60 bg-background p-4'>
                            <p className='text-muted-foreground text-xs'>失败</p>
                            <p className='mt-2 font-semibold text-2xl'>{reports.filter(report => report.status === 'failed').length}</p>
                          </div>
                          <div className='rounded-2xl border border-border/60 bg-background p-4'>
                            <p className='text-muted-foreground text-xs'>累计对话轮次</p>
                            <p className='mt-2 font-semibold text-2xl'>{reports.reduce((sum, report) => sum + report.turnCount, 0)}</p>
                          </div>
                        </div>

                        {reports.length === 0
                          ? (
                              <div className='flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center'>
                                <MessageSquareTextIcon className='size-8 text-muted-foreground' />
                                <p className='mt-4 font-medium text-sm'>暂无面试报告</p>
                                <p className='mt-2 max-w-xl text-muted-foreground text-sm leading-relaxed'>
                                  候选人开始并结束语音面试后，这里会展示逐场面试的总结、状态和完整对话记录。
                                </p>
                              </div>
                            )
                          : (
                              <Accordion className='space-y-4' collapsible type='single'>
                                {reports.map((report) => {
                                  const startedAt = report.startedAt ?? report.createdAt;
                                  const endedAt = report.endedAt ?? report.updatedAt;

                                  return (
                                    <AccordionItem className='overflow-hidden rounded-2xl border border-border/60 bg-background px-0 last:border-b' key={report.conversationId} value={report.conversationId}>
                                      <AccordionTrigger className='px-5 py-4 hover:no-underline'>
                                        <div className='min-w-0 flex-1 text-left'>
                                          <div className='flex flex-wrap items-center gap-2'>
                                            <TimeDisplay className='font-medium text-sm' options={DATE_TIME_DISPLAY_OPTIONS} value={startedAt} />
                                            <Badge variant={getReportBadgeVariant(report.status)}>{formatReportStatus(report.status)}</Badge>
                                            {report.callSuccessful
                                              ? <Badge variant='outline'>{report.callSuccessful}</Badge>
                                              : null}
                                          </div>
                                          <p className='mt-2 line-clamp-2 text-muted-foreground text-sm leading-relaxed'>
                                            {report.transcriptSummary ?? report.latestError ?? '暂无总结，等待后续同步。'}
                                          </p>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent className='px-5 pb-5'>
                                        <div className='grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.75fr)]'>
                                          <div className='space-y-4'>
                                            <div className='rounded-2xl border border-border/60 bg-muted/20 p-4'>
                                              <h4 className='font-medium text-sm'>会话概览</h4>
                                              <div className='mt-3 grid gap-2 text-sm'>
                                                <DetailRow label='会话 ID' value={<span className='break-all'>{report.conversationId}</span>} />
                                                <DetailRow label='开始时间' value={<TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={startedAt} />} />
                                                <DetailRow label='结束时间' value={<TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={endedAt} />} />
                                                <DetailRow label='消息统计' value={`共 ${report.turnCount} 条 · 候选人 ${report.userTurnCount} 条 · 面试官 ${report.agentTurnCount} 条`} />
                                                <DetailRow label='同步时间' value={<TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={report.lastSyncedAt} />} />
                                                <DetailRow label='Webhook' value={report.webhookReceivedAt ? <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={report.webhookReceivedAt} /> : '未收到'} />
                                              </div>
                                            </div>

                                            <div className='rounded-2xl border border-border/60 bg-background p-4'>
                                              <h4 className='font-medium text-sm'>最终总结</h4>
                                              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                                                {report.transcriptSummary ?? '暂无总结。'}
                                              </p>
                                              {report.latestError
                                                ? (
                                                    <div className='mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm'>
                                                      {report.latestError}
                                                    </div>
                                                  )
                                                : null}
                                            </div>

                                            <div className='rounded-2xl border border-border/60 bg-background p-4'>
                                              <h4 className='font-medium text-sm'>评估指标</h4>
                                              <div className='mt-4'>
                                                {renderEvaluationResults(report.evaluationCriteriaResults)}
                                              </div>
                                            </div>
                                          </div>

                                          <div className='rounded-2xl border border-border/60 bg-background p-4'>
                                            <h4 className='font-medium text-sm'>对话记录</h4>
                                            <div className='mt-4 space-y-3'>
                                              {report.turns.length > 0
                                                ? report.turns.map(turn => (
                                                    <div className='rounded-xl border border-border/60 bg-muted/20 p-3' key={turn.id}>
                                                      <div className='flex flex-wrap items-center gap-2 text-xs'>
                                                        <Badge variant={turn.role === 'user' ? 'outline' : 'secondary'}>
                                                          {turn.role === 'user' ? '候选人' : '面试官'}
                                                        </Badge>
                                                        <TimeDisplay className='text-muted-foreground' options={DATE_TIME_DISPLAY_OPTIONS} value={turn.createdAt} />
                                                        {typeof turn.timeInCallSecs === 'number'
                                                          ? (
                                                              <span className='text-muted-foreground'>
                                                                通话
                                                                {turn.timeInCallSecs}
                                                                s
                                                              </span>
                                                            )
                                                          : null}
                                                      </div>
                                                      <p className='mt-2 text-sm leading-relaxed'>{turn.message}</p>
                                                    </div>
                                                  ))
                                                : <p className='text-muted-foreground text-sm'>暂无对话记录。</p>}
                                            </div>
                                          </div>
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            )}
                      </div>
                    </TabsContent>

                    <TabsContent value='questions'>
                      <div className='rounded-2xl border border-border/60 bg-background p-4'>
                        <h3 className='font-medium text-sm'>AI 面试题</h3>
                        <div className='mt-4 space-y-3'>
                          {visibleInterviewQuestions.length > 0
                            ? visibleInterviewQuestions.map(question => (
                                <div className='rounded-xl border border-border/60 bg-muted/30 p-3' key={question.order}>
                                  <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3'>
                                    <span className='font-medium text-sm'>
                                      第
                                      {question.order}
                                      {' '}
                                      题
                                    </span>
                                    <span className='shrink-0 text-muted-foreground text-xs uppercase'>{question.difficulty}</span>
                                  </div>
                                  <p className='mt-2 text-sm leading-relaxed'>{truncateText(question.question, 240)}</p>
                                </div>
                              ))
                            : <p className='text-muted-foreground text-sm'>暂无面试题，可通过上传简历自动生成。</p>}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value='experience'>
                      <div className='space-y-6'>
                        <div className='rounded-2xl border border-border/60 bg-muted/30 p-5'>
                          <h3 className='font-medium text-sm'>工作经历</h3>
                          <div className='mt-4 space-y-4'>
                            {visibleWorkExperiences.length > 0
                              ? visibleWorkExperiences.map((item, index) => (
                                  <div key={`${item.company ?? 'company'}-${index}`}>
                                    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-sm'>
                                      {formatValue(item.company)}
                                      <span className='text-muted-foreground'>·</span>
                                      {formatValue(item.role)}
                                    </p>
                                    <p className='mt-1 text-muted-foreground text-xs'>{formatValue(item.period)}</p>
                                    <p className='mt-2 text-sm leading-relaxed'>{truncateText(item.summary, 280)}</p>
                                    {index < visibleWorkExperiences.length - 1 ? <Separator className='mt-4' /> : null}
                                  </div>
                                ))
                              : <p className='text-muted-foreground text-sm'>暂无工作经历。</p>}
                          </div>
                        </div>

                        <div className='rounded-2xl border border-border/60 bg-background p-5'>
                          <h3 className='font-medium text-sm'>项目经历</h3>
                          <div className='mt-4 space-y-4'>
                            {visibleProjectExperiences.length > 0
                              ? visibleProjectExperiences.map((item, index) => (
                                  <div key={`${item.name ?? 'project'}-${index}`}>
                                    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-sm'>
                                      {formatValue(item.name)}
                                      <span className='text-muted-foreground'>·</span>
                                      {formatValue(item.role)}
                                    </p>
                                    <p className='mt-1 text-muted-foreground text-xs'>{formatValue(item.period)}</p>
                                    <p className='mt-2 text-sm leading-relaxed'>{truncateText(item.summary, 280)}</p>
                                    <p className='mt-2 text-muted-foreground text-xs'>
                                      技术栈：
                                      {item.techStack.slice(0, 20).join('、') || '未发现信息'}
                                    </p>
                                    {index < visibleProjectExperiences.length - 1 ? <Separator className='mt-4' /> : null}
                                  </div>
                                ))
                              : <p className='text-muted-foreground text-sm'>暂无项目经历。</p>}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                )
              : (
                  <div className='flex min-h-[240px] items-center justify-center px-6 py-10 text-muted-foreground text-sm'>
                    暂无可展示的候选人详情。
                  </div>
                )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
