"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";

import { cn } from "@app/shared/utils";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={className} {...props} />;
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-[background-color,border-color,color,box-shadow,text-decoration-color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50 data-panel-open:[&>svg]:rotate-180 motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        {children}
        <IconChevronDown className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="grid grid-rows-[1fr] text-sm transition-[grid-template-rows,opacity,filter] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-ending-style:grid-rows-[0fr] data-ending-style:opacity-0 data-ending-style:blur-(--blur-small) data-starting-style:grid-rows-[0fr] data-starting-style:opacity-0 data-starting-style:blur-(--blur-small) motion-reduce:transition-none"
      keepMounted
      {...props}
    >
      <div className={cn("min-h-0 overflow-hidden pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
