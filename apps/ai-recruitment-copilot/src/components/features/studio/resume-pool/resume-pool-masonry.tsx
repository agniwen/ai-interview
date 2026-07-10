"use client";

import type { ReactNode } from "react";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

// oxlint-disable-next-line sort-keys -- Breakpoints are easier to audit in ascending viewport order.
const RESUME_POOL_MASONRY_COLUMNS = {
  0: 1,
  1024: 2,
  1280: 3,
  1440: 4,
} as const;

export function ResumePoolMasonry({ children }: { children: ReactNode }) {
  return (
    <ResponsiveMasonry columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}>
      <Masonry gutter="16px">{children}</Masonry>
    </ResponsiveMasonry>
  );
}
