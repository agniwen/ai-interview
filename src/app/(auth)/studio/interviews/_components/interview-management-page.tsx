'use client';

import type { Cell, ColumnDef, Header, SortingState } from '@tanstack/react-table';
import type { StudioInterviewListRecord } from '@/lib/studio-interviews';
import type { PaginatedStudioInterviewResult } from '@/server/queries/studio-interviews';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useAtomValue } from 'jotai';
import {
  ArrowUpDownIcon,
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CopyIcon,
  EyeIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { STUDIO_TUTORIAL_MOCK_RECORDS, STUDIO_TUTORIAL_MOCK_SEARCH } from '@/app/(auth)/studio/_hooks/studio-tutorial-mock';
import { studioTutorialStepAtom } from '@/app/(auth)/studio/_hooks/use-studio-tutorial';
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

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

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

async function fetchInterviews(params: {
  search: string
  status: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: string
}): Promise<PaginatedStudioInterviewResult> {
  const qs = new URLSearchParams();
  if (params.search)
    qs.set('search', params.search);
  if (params.status !== 'all')
    qs.set('status', params.status);
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  qs.set('sortBy', params.sortBy);
  qs.set('sortOrder', params.sortOrder);

  const response = await fetch(`/api/studio/interviews?${qs.toString()}`);
  const payload = await response.json();

  if (!response.ok || !payload?.records) {
    throw new Error(payload?.error ?? '加载列表失败');
  }

  return payload as PaginatedStudioInterviewResult;
}

export function InterviewManagementPage({ initialData }: { initialData: PaginatedStudioInterviewResult }) {
  const tutorialStep = useAtomValue(studioTutorialStepAtom);
  const queryClient = useQueryClient();

  // Filter / pagination / sorting state — drives the query key
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof studioInterviewStatusValues)[number]>('all');
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  // Dialogs
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewListRecord | null>(null);

  const deferredSearch = useDeferredValue(globalFilter);
  const currentSortBy = sorting[0]?.id ?? 'createdAt';
  const currentSortOrder = sorting[0]?.desc ? 'desc' : 'asc';

  const queryKey = ['studio-interviews', deferredSearch.trim(), statusFilter, page, pageSize, currentSortBy, currentSortOrder] as const;

  // Seed cache with SSR data only once on mount
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    queryClient.setQueryData(queryKey, initialData);
  }

  const { data = initialData, isFetching, isRefetching } = useQuery({
    queryKey,
    queryFn: () => fetchInterviews({
      search: deferredSearch.trim(),
      status: statusFilter,
      page,
      pageSize,
      sortBy: currentSortBy,
      sortOrder: currentSortOrder,
    }),
    placeholderData: prev => prev,
  });

  const records = data.records;
  const total = data.total;
  const totalPages = data.totalPages;

  const isTutorialActive = tutorialStep !== null;
  const displayRecords = isTutorialActive && records.length === 0
    ? STUDIO_TUTORIAL_MOCK_RECORDS
    : records;
  const displaySearch = isTutorialActive && tutorialStep >= 3 && globalFilter === ''
    ? STUDIO_TUTORIAL_MOCK_SEARCH
    : globalFilter;
  const isFilterLoading = isFetching && !isRefetching;
  const isMutationRefreshing = isRefetching;

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ['studio-interviews'] });
  }

  // Reset to page 1 when search/status changes
  const prevSearchRef = useMemo(() => ({ search: deferredSearch.trim(), status: statusFilter }), [deferredSearch, statusFilter]);
  const [lastFilterKey, setLastFilterKey] = useState(prevSearchRef);
  if (prevSearchRef !== lastFilterKey) {
    setLastFilterKey(prevSearchRef);
    if (page !== 1)
      setPage(1);
  }

  function goToPage(targetPage: number) {
    setPage(targetPage);
  }

  function handlePageSizeChange(newSize: string) {
    setPageSize(Number(newSize));
    setPage(1);
  }

  function handleSortingChange(updater: SortingState | ((prev: SortingState) => SortingState)) {
    const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
    setSorting(newSorting);
    setPage(1);
  }

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
              <DropdownMenuItem onSelect={() => setDetailRecordId(record.id)}>
                <EyeIcon className='size-4' />
                查看详情
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditRecordId(record.id)}>
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
    data: displayRecords,
    columns,
    state: {
      sorting,
      columnPinning: {
        left: ['candidateName'],
        right: ['actions'],
      },
    },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const summary = useMemo(() => ({
    total,
    ready: displayRecords.filter(item => item.status === 'ready').length,
    completed: displayRecords.filter(item => item.status === 'completed').length,
    rounds: displayRecords.reduce((count, item) => count + item.scheduleEntries.length, 0),
  }), [displayRecords, total]);

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

    setDeleteRecord(null);
    toast.success('面试记录已删除');
    invalidateList();
  }

  // Pagination info
  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return (
    <>
      <div className='space-y-6'>
        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4' data-tour='studio-stats'>
          {[
            { label: '总记录数', value: `${summary.total}`, hint: '所有候选人简历与流程记录' },
            { label: '待面试', value: `${summary.ready}`, hint: '流程已准备好，可发送链接开始面试' },
            { label: '已完成', value: `${summary.completed}`, hint: '全部轮次结束、已产出面试报告' },
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
        </section>

        <Card className='border-border/60 bg-background/95'>
          <CardHeader className='gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div>
              <CardTitle>简历库记录</CardTitle>
            </div>
            <div className='flex flex-col gap-3 sm:flex-row'>
              <Button
                disabled={isFetching}
                onClick={() => invalidateList()}
                size='icon'
                variant='outline'
              >
                <RefreshCwIcon className={`size-4 ${isMutationRefreshing ? 'animate-spin' : ''}`} />
                <span className='sr-only'>刷新</span>
              </Button>
              <div className='relative min-w-60' data-tour='studio-search'>
                <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input className='pr-9 pl-9' onChange={event => setGlobalFilter(event.target.value)} placeholder='搜索候选人、岗位、轮次或简历名' value={displaySearch} />
                {isFilterLoading
                  ? <Loader2Icon className='pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground' />
                  : null}
              </div>
              <Select onValueChange={value => setStatusFilter(value as typeof statusFilter)} value={statusFilter}>
                <SelectTrigger className='min-w-45' data-tour='studio-status-filter'>
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
              <div data-tour='studio-create-btn'>
                <CreateInterviewDialog onCreated={() => { invalidateList(); }} />
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {table.getRowModel().rows.length > 0
              ? (
                  <div className='rounded-2xl border border-border/60' data-tour='studio-table'>
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
                      <CreateInterviewDialog onCreated={async () => { invalidateList(); }} />
                    </EmptyContent>
                  </Empty>
                )}

            {/* Pagination bar */}
            {total > 0 && (
              <div className='flex flex-col items-center justify-between gap-4 px-2 sm:flex-row'>
                <p className='text-muted-foreground text-sm tabular-nums'>
                  显示第
                  {' '}
                  {startRow}
                  –
                  {endRow}
                  {' '}
                  条，共
                  {' '}
                  {total}
                  {' '}
                  条记录
                </p>
                <div className='flex items-center gap-4'>
                  <div className='flex items-center gap-2'>
                    <span className='text-muted-foreground text-sm'>每页</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className='h-8 w-[5.5rem]'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                            {' '}
                            条
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className='text-muted-foreground text-sm tabular-nums'>
                    第
                    {' '}
                    {page}
                    {' '}
                    /
                    {' '}
                    {totalPages}
                    {' '}
                    页
                  </span>

                  <div className='flex items-center gap-1'>
                    <Button
                      variant='outline'
                      size='icon'
                      className='size-8'
                      onClick={() => goToPage(1)}
                      disabled={page <= 1 || isFetching}
                      aria-label='第一页'
                    >
                      <ChevronsLeftIcon className='size-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='icon'
                      className='size-8'
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1 || isFetching}
                      aria-label='上一页'
                    >
                      <ChevronLeftIcon className='size-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='icon'
                      className='size-8'
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages || isFetching}
                      aria-label='下一页'
                    >
                      <ChevronRightIcon className='size-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='icon'
                      className='size-8'
                      onClick={() => goToPage(totalPages)}
                      disabled={page >= totalPages || isFetching}
                      aria-label='最后一页'
                    >
                      <ChevronsRightIcon className='size-4' />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <InterviewDetailDialog
        onOpenChange={open => !open && setDetailRecordId(null)}
        onUpdated={async () => { invalidateList(); }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      <EditInterviewDialog
        onOpenChange={open => !open && setEditRecordId(null)}
        onUpdated={async () => { invalidateList(); }}
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
