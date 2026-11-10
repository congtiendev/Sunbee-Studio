import { cn } from "@/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] dark:from-gray-800 dark:via-gray-700/70 dark:to-gray-800",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
