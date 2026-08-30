"use client";

import { IconLanguage } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as m from "@/paraglide/messages";
import { getLocale, locales, setLocale } from "@/paraglide/runtime";

const LANGUAGE_OPTIONS = [
  { label: m.language_simplified_chinese, value: "zh-CN" },
  { label: m.language_english, value: "en" },
  { label: m.language_japanese, value: "ja" },
  { label: m.language_korean, value: "ko" },
] as const;

function handleValueChange(value: string) {
  const locale = locales.find((candidate) => candidate === value);
  if (locale) {
    void setLocale(locale);
  }
}

export function LanguageToggle({ className }: { className?: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={m.language_switcher_label()}
            className={className}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconLanguage />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup onValueChange={handleValueChange} value={getLocale()}>
          {LANGUAGE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
