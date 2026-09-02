"use client";

import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@app/shared/utils";

export function RecruitingChatCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn("my-3 overflow-hidden bg-background", className)} {...props} />;
}
