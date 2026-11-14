import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the session and workspace list are loading. Mirrors the shell's layout. */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-svh flex-1" role="status" aria-label="Loading">
      <div className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/5" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4 sm:px-6">
          <Skeleton className="size-9 sm:w-64" />
          <Skeleton className="ml-auto size-9 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Generic page placeholder: a heading and a content block. */
export function PageSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export function WorkspaceListSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading workspaces">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}

export function DocumentBrowserSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading documents">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function DocumentSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading document">
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
