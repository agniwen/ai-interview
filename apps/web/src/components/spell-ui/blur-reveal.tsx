"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, JSX } from "react";

export interface BlurRevealProps {
  children: string;
  className?: string;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
  onAnimationComplete?: () => void;
  onAnimationStart?: () => void;
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
  inView?: boolean;
  once?: boolean;
  letterSpacing?: string | number;
}

export function BlurReveal({
  children,
  className,
  delay = 0,
  speedReveal = 1.5,
  speedSegment = 0.5,
  trigger = true,
  onAnimationComplete,
  onAnimationStart,
  as = "p",
  style,
  inView = false,
  once = true,
  letterSpacing,
}: BlurRevealProps) {
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  const stagger = 0.03 / speedReveal;
  const baseDuration = 0.3 / speedSegment;

  const containerVariants = {
    exit: {
      transition: {
        staggerChildren: stagger,
        staggerDirection: -1,
      },
    },
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: stagger,
      },
    },
  };

  const itemVariants = {
    exit: { filter: "blur(12px)", opacity: 0, y: 10 },
    hidden: { filter: "blur(12px)", opacity: 0, y: 10 },
    visible: {
      filter: "blur(0px)",
      opacity: 1,
      transition: {
        duration: baseDuration,
      },
      y: 0,
    },
  };

  return (
    <AnimatePresence mode="popLayout">
      {trigger && (
        <MotionTag
          animate={inView ? undefined : "visible"}
          className={className}
          exit="exit"
          initial="hidden"
          onAnimationComplete={onAnimationComplete}
          onAnimationStart={onAnimationStart}
          style={style}
          variants={containerVariants}
          viewport={{ once }}
          whileInView={inView ? "visible" : undefined}
        >
          <span className="sr-only">{children}</span>
          {children &&
            children.split(" ").map((word, wordIndex, wordsArray) => (
              <span
                aria-hidden="true"
                className="inline-block whitespace-nowrap"
                key={`word-${wordIndex}`}
              >
                {[...word].map((char, charIndex) => (
                  <motion.span
                    className="inline-block"
                    key={`char-${wordIndex}-${charIndex}`}
                    style={letterSpacing ? { marginRight: letterSpacing } : undefined}
                    variants={itemVariants}
                  >
                    {char}
                  </motion.span>
                ))}
                {wordIndex < wordsArray.length - 1 && (
                  <motion.span
                    className="inline-block"
                    key={`space-${wordIndex}`}
                    variants={itemVariants}
                  >
                    &nbsp;
                  </motion.span>
                )}
              </span>
            ))}
        </MotionTag>
      )}
    </AnimatePresence>
  );
}
