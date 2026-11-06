import { cn } from "@/utils";
import React from "react";

export interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  className?: string;
}

export default function MetricCard({
  icon,
  title,
  value,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "card-surface p-5 md:p-6",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90 [&>svg]:size-6">
        {icon}
      </div>

      <div className="mt-5">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {title}
        </span>
        <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
          {value}
        </h4>
      </div>
    </div>
  );
}
