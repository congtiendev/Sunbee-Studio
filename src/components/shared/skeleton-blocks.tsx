import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

/** A metric/stat card's loading shape — matches `MetricCard`. */
export function SkeletonStatCard() {
  return (
    <div className="card-surface p-5 md:p-6">
      <Skeleton className="size-12 rounded-xl" />
      <div className="mt-5 space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-6 w-14" />
      </div>
    </div>
  );
}

/** A row of `SkeletonStatCard`s, e.g. a dashboard's metric row. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** A generic content card's loading shape: icon/avatar + two text lines. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card-surface flex items-start gap-3 p-4", className)}>
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** A grid of `SkeletonCard`s, e.g. a projects/library list while it loads. */
export function SkeletonCardGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** A media-first card: a thumbnail block above two text lines (asset/document grids). */
export function SkeletonMediaCard() {
  return (
    <div className="card-surface flex flex-col gap-3 overflow-hidden p-0">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonMediaGrid({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonMediaCard key={i} />
      ))}
    </div>
  );
}

/** A table's loading shape: a few row bars with evenly-spaced columns. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-surface divide-y divide-gray-100 overflow-hidden p-0 dark:divide-gray-800">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }, (_, col) => (
            <Skeleton key={col} className={cn("h-4", col === 0 ? "w-8" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A tall block standing in for a chart or other large panel. */
export function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={cn("card-surface flex flex-col p-5 md:p-6", className)}>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-6 h-full min-h-24 w-full flex-1" />
    </div>
  );
}

/** One `Field`'s loading shape: a short label bar above an input-height bar. */
export function SkeletonFieldRow({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/** A settings/form card's loading shape: a title above a few label+field rows. */
export function SkeletonFormCard({
  rows = 2,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("card-surface flex flex-col gap-4 p-5 sm:p-6", className)}>
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonFieldRow key={i} />
      ))}
    </div>
  );
}

/** A handful of text-only lines, e.g. a page intro or list of simple rows. */
export function SkeletonLines({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === count - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A labeled section (e.g. a project's category): a heading bar above a card grid. */
export function SkeletonSection({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <SkeletonCardGrid count={cards} />
    </div>
  );
}
