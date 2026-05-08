"use client";

import type { ComponentProps } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from "@heroui/react";
import { cn } from "@/lib/utils";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardProps };

/**
 * CardAction — slot anchored to the top-right of CardHeader.
 * Project-custom (Hero UI doesn't ship one).
 */
export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}
