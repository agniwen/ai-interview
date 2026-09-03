import { cn } from "@app/shared/utils";

type IconStackProps = React.ComponentProps<"div">;

function IconStack({ className, children, style, ...props }: IconStackProps) {
  return (
    <div
      data-slot="icon-stack"
      className={cn(
        "text-foreground **:data-[slot=icon-stack-layer]:fill-background relative h-20 w-18",
        className,
      )}
      style={
        {
          "--icon-stack-content-x": "71%",
          "--icon-stack-content-y": "58%",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 72 81"
        fill="none"
        className="h-full w-full overflow-visible"
      >
        <ellipse
          cx="36"
          cy="76"
          rx="30"
          ry="7"
          fill="currentColor"
          fillOpacity="0.055"
          className="blur-[4px]"
        />

        <IconStackLayer opacity="0.4" />
        <IconStackLayer opacity="0.6" x={13.65} y={6.04} />
        <IconStackLayer opacity="0.8" x={27.32} y={12.08} active />
      </svg>

      {children ? (
        <div
          data-slot="icon-stack-content"
          className="text-muted-foreground pointer-events-none absolute top-[var(--icon-stack-content-y)] left-[var(--icon-stack-content-x)] flex -translate-x-1/2 -translate-y-1/2 scale-x-90 -skew-y-26 items-center justify-center"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function IconStackLayer({
  active = false,
  opacity,
  x = 0,
  y = 0,
}: {
  active?: boolean;
  opacity: string;
  x?: number;
  y?: number;
}) {
  return (
    <g opacity={opacity} transform={`translate(${x} ${y})`}>
      <path
        data-slot="icon-stack-layer"
        d="M42.25 2.05C41.44 1.63 40.4 1.67 39.26 2.24L7.96 18.19C5.39 19.5 3.3 23.11 3.3 26.23V64.32C3.3 66.07 3.95 67.29 4.96 67.82L1.84 66.23C0.82 65.71 0.18 64.48 0.18 62.73V24.64C0.18 21.51 2.26 17.91 4.84 16.6L36.14 0.65C37.28 0.07 38.32 0.04 39.13 0.46L42.25 2.05Z"
        stroke="currentColor"
        strokeOpacity={active ? "0.3" : "0.2"}
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        data-slot="icon-stack-layer"
        d="M42.25 2.05C43.27 2.56 43.92 3.8 43.92 5.54V43.63C43.92 46.77 41.83 50.36 39.25 51.67L7.96 67.62C6.81 68.21 5.77 68.23 4.96 67.82C3.95 67.3 3.3 66.07 3.3 64.32V26.23C3.3 23.1 5.39 19.5 7.96 18.19L39.26 2.24C40.4 1.66 41.45 1.63 42.25 2.05Z"
        stroke="currentColor"
        strokeOpacity={active ? "0.3" : "0.2"}
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export { IconStack, type IconStackProps };
