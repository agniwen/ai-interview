/**
 * Offline Iconify icons — Phosphor (`ph`) set.
 * @see https://icones.js.org/collection/ph
 *
 * Collection is registered at module load so Electron never hits the CDN.
 * Prefer the regular weight (no suffix); use `-light` / `-thin` when a
 * lighter stroke is needed for dense chrome.
 */
import { addCollection, Icon as IconifyIcon } from "@iconify/react";
import ph from "@iconify-json/ph/icons.json";
import type { ComponentProps } from "react";
import { cn } from "@arc/shared/utils";

addCollection(ph);

/** Iconify icon id, e.g. `ph:gear` or `ph:arrow-left-light`. */
export type AppIconName = `ph:${string}` | (string & {});

type IconifyProps = ComponentProps<typeof IconifyIcon>;

export type IconProps = Omit<IconifyProps, "icon"> & {
  icon: AppIconName;
};

export function Icon({ icon, className, ...props }: IconProps) {
  return (
    <IconifyIcon
      icon={icon}
      className={cn("size-4 shrink-0", className)}
      height="1em"
      width="1em"
      {...props}
    />
  );
}
