'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface SplitTextProps {
  text: string
  className?: string
}

export function SplitText({ text, className }: SplitTextProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <span className={className}>{text}</span>;
  }

  return (
    <motion.span
      animate='show'
      aria-label={text}
      className={cn('inline-block whitespace-pre-wrap', className)}
      initial='hidden'
      variants={{
        hidden: {},
        show: {
          transition: {
            delayChildren: 0.1,
            staggerChildren: 0.024,
          },
        },
      }}
    >
      {Array.from(text, (char, index) => (
        <motion.span
          aria-hidden='true'
          className='inline-block'
          key={`${char}-${index}`}
          variants={{
            hidden: { opacity: 0, transform: 'translateY(14px)' },
            show: {
              opacity: 1,
              transform: 'translateY(0px)',
              transition: { duration: 0.42, ease: 'easeOut' },
            },
          }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}
