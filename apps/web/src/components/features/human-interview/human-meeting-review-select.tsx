import { z } from "zod";
import { useState } from "react";
import type { Ref } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldTitle,
  FieldDescription,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";

export function HumanMeetingReviewSelect({
  id,
  label,
  placeholder,
  value,
  options,
  disabled,
  invalid = false,
  onValueChange,
  triggerRef,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  options: { value: string; label: string; description?: string }[];
  disabled: boolean;
  invalid?: boolean;
  onValueChange: (value: string | null) => void;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!isMobile) {
    return (
      <Select required disabled={disabled} value={value} onValueChange={onValueChange}>
        <SelectTrigger
          ref={triggerRef}
          id={id}
          aria-label={label}
          aria-required="true"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className="w-full"
        >
          <SelectValue placeholder={placeholder}>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                label={option.label}
                aria-label={option.label}
                aria-describedby={
                  option.description ? `${id}-${option.value}-description` : undefined
                }
              >
                <span className="flex flex-col items-start gap-1">
                  <span>{option.label}</span>
                  {option.description ? (
                    <span
                      id={`${id}-${option.value}-description`}
                      className="text-muted-foreground text-xs"
                    >
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          disabled={disabled}
          variant="outline"
          size="lg"
          className="w-full justify-between"
        >
          {options.find((option) => option.value === value)?.label ?? placeholder}
          <IconChevronDown data-icon="inline-end" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{label}</DrawerTitle>
          <DrawerDescription>{placeholder}</DrawerDescription>
        </DrawerHeader>
        <RadioGroup
          aria-label={label}
          required
          disabled={disabled}
          value={value ?? ""}
          onValueChange={(next) => {
            const parsed = z.string().safeParse(next);
            if (!parsed.success) {
              return;
            }
            onValueChange(parsed.data);
            setOpen(false);
          }}
          className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          {options.map((option) => (
            <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{option.label}</FieldTitle>
                  {option.description ? (
                    <FieldDescription>{option.description}</FieldDescription>
                  ) : null}
                </FieldContent>
                <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </DrawerContent>
    </Drawer>
  );
}
