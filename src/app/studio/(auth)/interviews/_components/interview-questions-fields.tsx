'use client';

import type { InterviewQuestion } from '@/lib/interview/types';
import { GripVerticalIcon, Trash2Icon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
] as const;

export function InterviewQuestionsFields({
  questions,
  onChange,
  disabled,
}: {
  questions: InterviewQuestion[]
  onChange: (questions: InterviewQuestion[]) => void
  disabled?: boolean
}) {
  function updateQuestion(index: number, patch: Partial<InterviewQuestion>) {
    const next = questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onChange(next);
  }

  function removeQuestion(index: number) {
    const next = questions
      .filter((_, i) => i !== index)
      .map((q, i) => ({ ...q, order: i + 1 }));
    onChange(next);
  }

  function addQuestion() {
    onChange([
      ...questions,
      {
        order: questions.length + 1,
        difficulty: 'medium',
        question: '',
      },
    ]);
  }

  if (questions.length === 0) {
    return (
      <div className='flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center'>
        <p className='font-medium text-sm'>暂无面试题</p>
        <p className='mt-2 max-w-md text-muted-foreground text-sm'>
          上传简历后会自动生成面试题，也可以手动添加。
        </p>
        <Button
          className='mt-4'
          disabled={disabled}
          onClick={addQuestion}
          size='sm'
          type='button'
          variant='outline'
        >
          添加题目
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {questions.map((question, index) => (
        <div
          className='flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3'
          key={index}
        >
          <div className='flex shrink-0 items-center pt-2 text-muted-foreground'>
            <GripVerticalIcon className='size-4' />
            <span className='ml-1 min-w-5 text-xs'>{index + 1}</span>
          </div>

          <div className='min-w-0 flex-1 space-y-2'>
            <Input
              disabled={disabled}
              onChange={event => updateQuestion(index, { question: event.target.value })}
              placeholder='输入面试题目'
              value={question.question}
            />
            <Select
              disabled={disabled}
              onValueChange={value => updateQuestion(index, { difficulty: value as InterviewQuestion['difficulty'] })}
              value={question.difficulty}
            >
              <SelectTrigger className='w-28'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className='shrink-0 mt-1'
            disabled={disabled}
            onClick={() => removeQuestion(index)}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <Trash2Icon className='size-3.5' />
          </Button>
        </div>
      ))}

      <Button
        className='w-full'
        disabled={disabled}
        onClick={addQuestion}
        size='sm'
        type='button'
        variant='outline'
      >
        添加题目
      </Button>
    </div>
  );
}
