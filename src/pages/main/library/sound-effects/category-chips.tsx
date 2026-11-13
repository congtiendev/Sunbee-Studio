import { cn } from "@/utils";
import type { ComponentType } from "react";
import type { IconProps } from "@/icons";

export interface ChipItem {
  value: string;
  label: string;
  count?: number;
  Icon?: ComponentType<IconProps>;
}

/** Horizontally scrolling pill filters, like the genre/mood row of a story music picker. */
export function CategoryChips({
  items,
  value,
  onChange,
}: {
  items: ChipItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
              selected
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]",
            )}
          >
            {item.Icon && <item.Icon className="size-4" />}
            {item.label}
            {item.count !== undefined && (
              <span className={cn("text-xs", selected ? "opacity-70" : "text-gray-400 dark:text-gray-500")}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
