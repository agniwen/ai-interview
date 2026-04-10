'use client';

import type { InterviewFormApi } from './interview-form';
import type { ScheduleEntryStatus } from '@/lib/studio-interviews';
import { CalendarDaysIcon, LockIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createDefaultScheduleEntry, scheduleEntryStatusMeta } from '@/lib/studio-interviews';
import {
  hasFieldErrors,
  toFieldErrors,
} from './interview-form';

export function InterviewScheduleFields({
  form,
  roundStatuses,
}: {
  form: InterviewFormApi
  roundStatuses?: Record<string, ScheduleEntryStatus>
}) {
  return (
    <form.Field mode='array' name='scheduleEntries'>
      {(scheduleEntriesField) => {
        const rootErrors = toFieldErrors(scheduleEntriesField.state.meta.errors);

        return (
          <div className='space-y-4'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0'>
                <h3 className='font-medium text-sm'>面试安排</h3>
                <p className='mt-1 text-muted-foreground text-xs'>支持添加一面、二面、三面等多个轮次，并维护计划时间。</p>
              </div>
              <Button
                className='shrink-0 self-start'
                onClick={() => scheduleEntriesField.pushValue(createDefaultScheduleEntry(scheduleEntriesField.state.value.length))}
                size='sm'
                type='button'
                variant='outline'
              >
                <PlusIcon className='size-4' />
                新增轮次
              </Button>
            </div>

            <div className='space-y-4'>
              {scheduleEntriesField.state.value.map((entry, index) => {
                const entryStatus = entry.id ? roundStatuses?.[entry.id] : undefined;
                const isLocked = entryStatus === 'completed' || entryStatus === 'in_progress';
                const statusMeta = entryStatus ? scheduleEntryStatusMeta[entryStatus] : undefined;

                return (
                  <div className='rounded-xl border border-border/60 bg-muted/20 p-4' key={entry.id || `schedule-${index}`}>
                    <div className='mb-3 flex items-center justify-between gap-3'>
                      <div className='flex items-center gap-2'>
                        <p className='font-medium text-sm'>
                          第
                          {index + 1}
                          {' '}
                          轮
                        </p>
                        {statusMeta
                          ? <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                          : null}
                        {isLocked
                          ? (
                              <span className='flex items-center gap-1 text-muted-foreground text-xs'>
                                <LockIcon className='size-3' />
                                不可编辑
                              </span>
                            )
                          : null}
                      </div>
                      <Button
                        disabled={scheduleEntriesField.state.value.length <= 1 || isLocked}
                        onClick={() => void scheduleEntriesField.removeValue(index)}
                        size='icon'
                        type='button'
                        variant='ghost'
                      >
                        <Trash2Icon className='size-4' />
                      </Button>
                    </div>

                    <FieldGroup className='grid gap-4 md:grid-cols-2'>
                      <form.Field name={`scheduleEntries[${index}].roundLabel` as const}>
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                              <FieldLabel htmlFor={field.name}>轮次名称</FieldLabel>
                              <FieldContent className='gap-2'>
                                <Input
                                  aria-invalid={!!errors?.length}
                                  className='w-full'
                                  disabled={isLocked}
                                  id={field.name}
                                  onBlur={field.handleBlur}
                                  onChange={event => field.handleChange(event.target.value)}
                                  placeholder='如：一面、二面、HR 面'
                                  value={field.state.value}
                                />
                                <FieldError errors={errors} />
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>

                      <form.Field name={`scheduleEntries[${index}].scheduledAt` as const}>
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);

                          return (
                            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                              <FieldLabel htmlFor={field.name}>面试时间</FieldLabel>
                              <FieldContent className='gap-2'>
                                <div className='relative'>
                                  <CalendarDaysIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                                  <Input
                                    aria-invalid={!!errors?.length}
                                    className='w-full pl-9'
                                    disabled={isLocked}
                                    id={field.name}
                                    onBlur={field.handleBlur}
                                    onChange={event => field.handleChange(event.target.value)}
                                    type='datetime-local'
                                    value={field.state.value}
                                  />
                                </div>
                                <FieldDescription>{isLocked ? '该轮次已开始或已结束，时间不可修改。' : '可留空，表示轮次已创建但时间待定。'}</FieldDescription>
                                <FieldError errors={errors} />
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </form.Field>
                    </FieldGroup>

                    <form.Field name={`scheduleEntries[${index}].notes` as const}>
                      {(field) => {
                        const errors = toFieldErrors(field.state.meta.errors);

                        return (
                          <Field className='mt-4' data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                            <FieldLabel htmlFor={field.name}>轮次备注</FieldLabel>
                            <FieldContent className='gap-2'>
                              <Textarea
                                aria-invalid={!!errors?.length}
                                className='min-h-24 w-full'
                                id={field.name}
                                onBlur={field.handleBlur}
                                onChange={event => field.handleChange(event.target.value)}
                                placeholder='记录该轮次关注点、面试官、准备要求等'
                                value={field.state.value}
                              />
                              <FieldError errors={errors} />
                            </FieldContent>
                          </Field>
                        );
                      }}
                    </form.Field>
                  </div>
                );
              })}

              <FieldError errors={rootErrors} />
            </div>
          </div>
        );
      }}
    </form.Field>
  );
}
