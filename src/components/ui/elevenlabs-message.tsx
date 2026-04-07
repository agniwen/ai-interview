import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type ElevenLabsMessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant'
};

export function ElevenLabsMessage({ className, from, ...props }: ElevenLabsMessageProps) {
  return (
    <div
      className={cn(
        'group flex w-full items-end justify-end gap-2 py-2',
        from === 'user' ? 'is-user' : 'is-assistant flex-row-reverse justify-end',
        className,
      )}
      {...props}
    />
  );
}

const messageContentVariants = cva(
  'flex flex-col gap-2 overflow-hidden rounded-xl text-sm leading-relaxed',
  {
    variants: {
      variant: {
        contained: [
          'max-w-[85%] px-4 py-3',
          'group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground',
          'group-[.is-assistant]:bg-secondary group-[.is-assistant]:text-foreground',
        ],
        flat: [
          'group-[.is-user]:max-w-[85%] group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
          'group-[.is-assistant]:text-foreground',
        ],
      },
    },
    defaultVariants: {
      variant: 'contained',
    },
  },
);

export type ElevenLabsMessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>;

export function ElevenLabsMessageContent({
  children,
  className,
  variant,
  ...props
}: ElevenLabsMessageContentProps) {
  return (
    <div
      className={cn(messageContentVariants({ variant, className }))}
      {...props}
    >
      {children}
    </div>
  );
}
