import { cn } from "@arc/shared/utils";

/**
 * Copied from the web app's 个人中心 账号资料 section
 * (apps/ai-recruitment-copilot/src/components/features/studio/profile/profile-settings-ui.tsx)
 * so the desktop settings page shares the same section/group/row rhythm.
 */
export function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="space-y-0.5">
        <h2 className="font-medium text-sm">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y overflow-hidden rounded-lg border", className)}>{children}</div>
  );
}

export function SettingsRow({
  children,
  description,
  label,
  htmlFor,
}: {
  children: React.ReactNode;
  description?: string;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-0.5">
        <label className="font-medium text-sm" htmlFor={htmlFor}>
          {label}
        </label>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
        ) : null}
      </div>
      <div className="w-full shrink-0 sm:w-auto sm:min-w-[14rem] sm:max-w-xs">{children}</div>
    </div>
  );
}
