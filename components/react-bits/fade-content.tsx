'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface FadeContentProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function FadeContent({ children, className, delay = 0 }: FadeContentProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, transform: 'translateY(16px)' }}
      transition={{ duration: 0.55, ease: 'easeOut', delay }}
      viewport={{ once: true, amount: 0.35 }}
      whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
    >
      {children}
    </motion.div>
  );
}
