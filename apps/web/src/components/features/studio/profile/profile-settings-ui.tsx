import { cn } from "@app/shared/utils";
import { Card } from "@/components/ui/card";

export function SettingsSection({
  children,
  description,
  id,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  /** 页内锚点，供其他页面深链定位到该设置分组。 */
  id?: string;
  title: string;
}) {
  return (
    <section className="flex scroll-mt-6 flex-col gap-2.5" id={id}>
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
  return <Card className={cn("divide-y overflow-hidden", className)}>{children}</Card>;
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
      <div className="flex w-full shrink-0 justify-end sm:w-auto sm:min-w-[14rem] sm:max-w-xs">
        {children}
      </div>
    </div>
  );
}
