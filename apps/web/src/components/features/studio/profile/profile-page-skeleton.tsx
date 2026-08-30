import { Skeleton } from "@/components/ui/skeleton";

function ProfileSettingsGroupSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div
      className="divide-y overflow-hidden rounded-lg border"
      data-slot="profile-settings-group-skeleton"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          key={index}
        >
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-20" />
            {index === 0 ? <Skeleton className="h-3 w-52 max-w-full" /> : null}
          </div>
          <Skeleton className="h-9 w-full sm:w-56" />
        </div>
      ))}
    </div>
  );
}

function ProfileSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-4 w-20" />
      <ProfileSettingsGroupSkeleton rows={rows} />
    </div>
  );
}

export function ActivitySectionSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border p-3" data-slot="profile-activity-skeleton">
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-24 w-full rounded-md" />
    </div>
  );
}

export function ProfilePageContentSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-5"
      data-slot="profile-page-content-skeleton"
    >
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-col items-center gap-3 py-2">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <ActivitySectionSkeleton />
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton rows={1} />
      <ProfileSectionSkeleton rows={1} />
    </div>
  );
}
