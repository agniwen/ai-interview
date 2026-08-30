"use client";

export type ChevronsUpDownIconProps = React.ComponentProps<"svg">;

const pathClassName =
  "origin-center [transform-box:fill-box] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] in-data-[panel-open]:-scale-y-100 motion-reduce:transition-none";

function ChevronsUpDownIcon({ className, ...props }: ChevronsUpDownIconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path className={pathClassName} d="M7 15L12 20L17 15" />
      <path className={pathClassName} d="M7 9L12 4L17 9" />
    </svg>
  );
}

export { ChevronsUpDownIcon };
