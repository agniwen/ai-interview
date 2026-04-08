'use client';

import type { ColumnDef, Header, Cell, SortingState } from '@tanstack/react-table';
import type { StudioInterviewListRecord } from '@/lib/studio-interviews';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDownIcon,
  BotIcon,
  CopyIcon,
  EyeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ElevenLabsQuota } from '@/components/interview/elevenlabs-quota';
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from '@/components/time-display';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { copyTextToClipboard, toAbsoluteUrl } from '@/lib/clipboard';
import {
  scheduleEntryStatusMeta,
  studioInterviewStatusMeta,
  studioInterviewStatusValues,
} from '@/lib/studio-interviews';
import { CreateInterviewDialog } from './create-interview-dialog';
import { EditInterviewDialog } from './edit-interview-dialog';
import { InterviewDetailDialog } from './interview-detail-dialog';
import { InterviewStatusBadge } from './interview-status-badge';

function getPinningStyles(column: Header<StudioInterviewListRecord, unknown>['column'] | Cell<StudioInterviewListRecord, unknown>['column']): React.CSSProperties {
  const isPinned = column.getIsPinned();

  if (!isPinned) {
    return {};
  }

  return {
    position: 'sticky',
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    zIndex: 1,
  };
}

export function InterviewManagementPage({ initialRecords }: { initialRecords: StudioInterviewListRecord[] }) {
  const [records, dispatchRecords] = useReducer(
    (previous: StudioInterviewListRecord[], action: { type: 'replace', records: StudioInterviewListRecord[] } | { type: 'remove', id: string }) => {
      if (action.type === 'replace')
        return action.records;
      if (action.type === 'remove')
        return previous.filter(r => r.id !== action.id);
      return previous;
    },
    initialRecords,
  );
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof studioInterviewStatusValues)[number]>('all');
  const [requestState, setRequestState] = useState<'idle' | 'filter' | 'mutation'>('idle');
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewListRecord | null>(null);
  const deferredSearch = useDeferredValue(globalFilter);
  const hasSkippedInitialFetchRef = useRef(false);
  const activeRequestRef = useRef<{ id: number, controller: AbortController } | null>(null);
  const requestSequenceRef = useRef(0);
  const isFilterLoading = requestState === 'filter';
  const isMutationRefreshing = requestState === 'mutation';

  const reloadRecords = useCallback(async ({
    search,
    status,
    source,
  }: {
    search: string
    status: 'all' | (typeof studioInterviewStatusValues)[number]
    source: 'filter' | 'mutation'
  }) => {
    activeRequestRef.current?.controller.abort();

    const controller = new AbortController();
    const requestId = requestSequenceRef.current + 1;
    activeRequestRef.current = { id: requestId, controller };
    requestSequenceRef.current = requestId;
    setRequestState(source);

    function isCurrentRequest() {
      return activeRequestRef.current?.id === requestId;
    }

    try {
      const params = new URLSearchParams();

      if (search) {
        params.set('search', search);
      }

      if (status !== 'all') {
        params.set('status', status);
      }

      const query = params.toString();
      const response = await fetch(query ? `/api/studio/interviews?${query}` : '/api/studio/interviews', {
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as StudioInterviewListRecord[] | { error?: string } | null;

      if (!response.ok || !payload || !Array.isArray(payload)) {
        throw new Error(payload && !Array.isArray(payload) ? payload.error ?? '加载列表失败' : '加载列表失败');
      }

      if (!isCurrentRequest()) {
        return;
      }

      startTransition(() => {
        dispatchRecords({ type: 'replace', records: payload });
      });
    }
    catch (error) {
      if (controller.signal.aborted || !isCurrentRequest()) {
        return;
      }

      toast.error(error instanceof Error ? error.message : '加载列表失败');
    }
    finally {
      if (isCurrentRequest()) {
        activeRequestRef.current = null;
        setRequestState('idle');
      }
    }
  }, []);

  useEffect(() => {
    const search = deferredSearch.trim();

    if (!hasSkippedInitialFetchRef.current) {
      hasSkippedInitialFetchRef.current = true;

      if (!search && statusFilter === 'all') {
        return;
      }
    }

    void reloadRecords({
      search,
      status: statusFilter,
      source: 'filter',
    });
  }, [deferredSearch, reloadRecords, statusFilter]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.controller.abort();
    };
  }, []);

  async function copyInterviewLink(record: StudioInterviewListRecord) {
    const lastEntry = record.scheduleEntries.at(-1);
    const link = lastEntry
      ? `/interview/${record.id}/${lastEntry.id}`
      : record.interviewLink;
    const fullLink = toAbsoluteUrl(link);

    try {
      const result = await copyTextToClipboard(fullLink);

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

  function openDetail(recordId: string) {
    setDetailRecordId(recordId);
  }

  function openEdit(recordId: string) {
    setEditRecordId(recordId);
  }

  const columns = useMemo<ColumnDef<StudioInterviewListRecord>[]>(() => [
    {
      accessorKey: 'candidateName',
      size: 180,
      header: ({ column }) => (
        <Button className='px-0' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} variant='ghost'>
          候选人
          <ArrowUpDownIcon className='size-4' />
        </Button>
      ),
      cell: ({ row }) => {
        const record = row.original;

        return (
          <div className='min-w-0'>
            <p className='truncate font-medium'>{record.candidateName}</p>
            <p className='truncate text-muted-foreground text-xs'>
              {record.candidateEmail || '未填写邮箱'}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: 'targetRole',
      header: '目标岗位',
      cell: ({ row }) => row.original.targetRole || '待识别岗位',
    },
    {
      accessorKey: 'resumeFileName',
      header: '简历文件',
      cell: ({ row }) => <div className='max-w-48 truncate text-sm'>{row.original.resumeFileName || '手动创建'}</div>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <InterviewStatusBadge status={row.original.status} />,
    },
    {
      id: 'currentRound',
      header: '当前轮次',
      cell: ({ row }) => {
        const currentEntry = row.original.scheduleEntries[0];

        if (!currentEntry) {
          return '未安排';
        }

        const statusKey = (currentEntry.status ?? 'pending') as keyof typeof scheduleEntryStatusMeta;
        const statusMeta = scheduleEntryStatusMeta[statusKey] ?? scheduleEntryStatusMeta.pending;

        return (
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <p className='truncate text-sm font-medium'>{currentEntry.roundLabel}</p>
              <Badge variant={statusMeta.tone} className='text-[10px] px-1.5 py-0'>{statusMeta.label}</Badge>
            </div>
            <p className='truncate text-muted-foreground text-xs'>
              {currentEntry.scheduledAt
                ? <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={currentEntry.scheduledAt} />
                : '时间待定'}
            </p>
          </div>
        );
      },
    },
    {
      id: 'questionCount',
      header: '题目数',
      cell: ({ row }) => `${row.original.questionCount} 题`,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <Button className='px-0' onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} variant='ghost'>
          创建时间
          <ArrowUpDownIcon className='size-4' />
        </Button>
      ),
      cell: ({ row }) => <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={row.original.createdAt} />,
    },
    {
      id: 'actions',
      size: 60,
      enableHiding: false,
      cell: ({ row }) => {
        const record = row.original;

        return (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button className='size-8 p-0' variant='ghost'>
                <MoreHorizontalIcon className='size-4' />
                <span className='sr-only'>打开操作菜单</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
              <DropdownMenuLabel>操作</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void copyInterviewLink(record)}>
                <CopyIcon className='size-4' />
                复制面试链接
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDetail(record.id)}>
                <EyeIcon className='size-4' />
                查看详情
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openEdit(record.id)}>
                <PencilIcon className='size-4' />
                编辑记录
              </DropdownMenuItem>
              <DropdownMenuItem className='text-destructive focus:text-destructive' onSelect={() => setDeleteRecord(record)}>
                <Trash2Icon className='size-4' />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: records,
    columns,
    state: {
      sorting,
      columnPinning: {
        left: ['candidateName'],
        right: ['actions'],
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const summary = useMemo(() => ({
    total: records.length,
    ready: records.filter(item => item.status === 'ready').length,
    completed: records.filter(item => item.status === 'completed').length,
    rounds: records.reduce((count, item) => count + item.scheduleEntries.length, 0),
  }), [records]);

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }

    const response = await fetch(`/api/studio/interviews/${deleteRecord.id}`, {
      method: 'DELETE',
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      toast.error(payload?.error ?? '删除失败');
      return;
    }

    dispatchRecords({ type: 'remove', id: deleteRecord.id });
    setDeleteRecord(null);
    toast.success('面试记录已删除');
    reloadRecords({
      search: deferredSearch.trim(),
      status: statusFilter,
      source: 'mutation',
    });
  }

  return (
    <>
      <div className='space-y-6'>
        <section className='rounded-[1.75rem] border border-border/60 bg-background px-6 py-6 shadow-sm lg:px-8 lg:py-8'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
            <div className='max-w-2xl space-y-3'>
              <Badge variant='secondary'>Studio / 简历库</Badge>
              <h1 className='text-balance font-semibold text-3xl tracking-tight'>候选人面试简历库</h1>
              <p className='text-muted-foreground leading-relaxed'>
                管理候选人简历、面试流程与多轮时间安排，并为每位候选人生成唯一的面试入口链接。
              </p>
            </div>
            <CreateInterviewDialog onCreated={async () => {
              await reloadRecords({
                search: deferredSearch.trim(),
                status: statusFilter,
                source: 'mutation',
              });
            }}
            />
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {[
            { label: '总记录数', value: `${summary.total}`, hint: '所有候选人简历与流程记录' },
            { label: '待面试', value: `${summary.ready}`, hint: '流程已准备好，可发送链接开始面试' },
            { label: '面试轮次数', value: `${summary.rounds}`, hint: '所有候选人累计安排的轮次总数' },
          ].map(item => (
            <Card className='border-border/60 bg-background/92' key={item.label}>
              <CardHeader className='pb-2'>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className='text-3xl'>{item.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground text-sm'>{item.hint}</p>
              </CardContent>
            </Card>
          ))}
          <Card className='border-border/60 bg-background/92'>
            <CardContent className='pt-0'>
              <ElevenLabsQuota compact />
            </CardContent>
          </Card>
        </section>

        <Card className='border-border/60 bg-background/95'>
          <CardHeader className='gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div>
              <CardTitle>简历库记录</CardTitle>
              <CardDescription>
                {isFilterLoading
                  ? '正在搜索并更新结果...'
                  : isMutationRefreshing
                    ? '正在刷新列表结果...'
                    : '支持搜索、状态筛选、复制链接、查看详情、编辑和删除。'}
              </CardDescription>
            </div>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <Button
                disabled={requestState !== 'idle'}
                onClick={() => void reloadRecords({ search: deferredSearch.trim(), status: statusFilter, source: 'mutation' })}
                size='icon'
                variant='outline'
              >
                <RefreshCwIcon className={`size-4 ${isMutationRefreshing ? 'animate-spin' : ''}`} />
                <span className='sr-only'>刷新</span>
              </Button>
              <div className='relative min-w-60'>
                <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input className='pr-9 pl-9' onChange={event => setGlobalFilter(event.target.value)} placeholder='搜索候选人、岗位、轮次或简历名' value={globalFilter} />
                {isFilterLoading
                  ? <Loader2Icon className='pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground' />
                  : null}
              </div>
              <Select onValueChange={value => setStatusFilter(value as typeof statusFilter)} value={statusFilter}>
                <SelectTrigger className='min-w-45'>
                  <SelectValue placeholder='按状态筛选' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部状态</SelectItem>
                  {studioInterviewStatusValues.map(status => (
                    <SelectItem key={status} value={status}>
                      {studioInterviewStatusMeta[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {table.getRowModel().rows.length > 0
              ? (
                  <div className='rounded-2xl border border-border/60'>
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map(headerGroup => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                              const isPinned = header.column.getIsPinned();

                              return (
                                <TableHead
                                  className={isPinned ? 'bg-background' : undefined}
                                  key={header.id}
                                  style={getPinningStyles(header.column)}
                                >
                                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map(row => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => {
                              const isPinned = cell.column.getIsPinned();

                              return (
                                <TableCell
                                  className={isPinned ? 'bg-background' : undefined}
                                  key={cell.id}
                                  style={getPinningStyles(cell.column)}
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              : (
                  <Empty className='border-border/60'>
                    <EmptyHeader>
                      <EmptyMedia variant='icon'>
                        <BotIcon className='size-5' />
                      </EmptyMedia>
                      <EmptyTitle>还没有候选人简历记录</EmptyTitle>
                      <EmptyDescription>
                        先创建一条候选人简历记录，可以直接手动录入，也可以上传 PDF 自动分析并生成面试题。
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <CreateInterviewDialog onCreated={async () => {
                        await reloadRecords({
                          search: deferredSearch.trim(),
                          status: statusFilter,
                          source: 'mutation',
                        });
                      }}
                      />
                    </EmptyContent>
                  </Empty>
                )}
          </CardContent>
        </Card>
      </div>

      <InterviewDetailDialog
        onOpenChange={open => !open && setDetailRecordId(null)}
        onUpdated={async () => {
          await reloadRecords({
            search: deferredSearch.trim(),
            status: statusFilter,
            source: 'mutation',
          });
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      <EditInterviewDialog
        onOpenChange={open => !open && setEditRecordId(null)}
        onUpdated={async () => {
          await reloadRecords({
            search: deferredSearch.trim(),
            status: statusFilter,
            source: 'mutation',
          });
        }}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <AlertDialog onOpenChange={open => !open && setDeleteRecord(null)} open={deleteRecord !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条面试记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，包括候选人解析信息和 AI 题目。当前记录：
              {deleteRecord?.candidateName ?? '未知候选人'}
              。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant='destructive'>
              删除记录
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
