import { cn } from "@/lib/utils";

/** Placeholder block shown while data loads. Pair with `useLoadingTimeout` + `LoadError`. */
export const Skeleton = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn(
      "animate-pulse rounded-md bg-surface-container motion-reduce:animate-none",
      className,
    )}
  />
);

/** A card-shaped loading state: a title line and a few body lines. */
export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => (
  <div
    role="status"
    aria-label="Loading"
    className="flex h-full flex-col gap-3 rounded-card bg-surface-container-lowest p-4 shadow-card"
  >
    <Skeleton className="h-5 w-1/3" />
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton
        key={i}
        className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")}
      />
    ))}
  </div>
);
