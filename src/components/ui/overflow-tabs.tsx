import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDownIcon } from "@/icons";
import { cn } from "@/utils";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface OverflowTabItem {
  value: string;
  /** Content of the tab trigger. */
  label: ReactNode;
  /** Content of the overflow menu entry (defaults to `label`). */
  menuLabel?: ReactNode;
  triggerClassName?: string;
}

interface OverflowTabsListProps {
  items: OverflowTabItem[];
  /** The selected tab (the parent `Tabs` must be controlled with the same value). */
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "line";
  /** Text of the overflow button, e.g. "More". */
  moreLabel: ReactNode;
  className?: string;
}

/**
 * A `TabsList` that never overflows its container: tabs that don't fit move
 * into a "More ▾" dropdown. The selected tab is always kept visible (it takes
 * the last visible slot), so the user always sees where they are.
 *
 * Use inside a controlled `<Tabs value onValueChange>`; panels stay
 * `TabsContent` as usual.
 */
function OverflowTabsList({
  items,
  value,
  onValueChange,
  variant = "default",
  moreLabel,
  className,
}: OverflowTabsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // Last measured width of every trigger (measured whenever it's rendered).
  const widths = useRef(new Map<string, number>());
  const [visibleCount, setVisibleCount] = useState(items.length);

  // Latest items for the observer callback without re-subscribing on every render.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  useEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) return;

    const recompute = () => {
      const all = itemsRef.current;
      const style = getComputedStyle(list);
      const gap = parseFloat(style.columnGap) || 0;
      const padding =
        (parseFloat(style.paddingInlineStart) || 0) +
        (parseFloat(style.paddingInlineEnd) || 0);
      const available = container.clientWidth - padding;
      const tabWidths = all.map((item) => widths.current.get(item.value) ?? 0);
      const total =
        tabWidths.reduce((sum, w) => sum + w, 0) +
        gap * Math.max(0, all.length - 1);
      if (total <= available) {
        setVisibleCount(all.length);
        return;
      }
      const reserve = (moreRef.current?.offsetWidth || 96) + gap;
      let used = 0;
      let count = 0;
      for (const w of tabWidths) {
        const next = used + (count > 0 ? gap : 0) + w;
        if (next + reserve > available) break;
        used = next;
        count++;
      }
      // Always show at least the selected tab next to the menu.
      setVisibleCount(Math.max(1, count));
    };

    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Which tabs show: the first `visibleCount`, with the selected one swapped
  // into the last slot when it would otherwise be hidden.
  const count = Math.min(visibleCount, items.length);
  const activeIndex = items.findIndex((item) => item.value === value);
  const visibleIndexes = new Set(items.slice(0, count).map((_, i) => i));
  if (activeIndex >= count && count > 0) {
    visibleIndexes.delete(count - 1);
    visibleIndexes.add(activeIndex);
  }
  const visible = items.filter((_, i) => visibleIndexes.has(i));
  const hidden = items.filter((_, i) => !visibleIndexes.has(i));

  return (
    <div ref={containerRef} className="w-full min-w-0">
      <TabsList
        ref={listRef}
        variant={variant}
        className={cn("max-w-full flex-nowrap overflow-hidden", className)}
      >
        {visible.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            ref={(node: HTMLElement | null) => {
              if (node) widths.current.set(item.value, node.offsetWidth);
            }}
            className={cn("shrink-0", item.triggerClassName)}
          >
            {item.label}
          </TabsTrigger>
        ))}
        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={moreRef}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1 px-3 text-sm font-medium whitespace-nowrap text-gray-500 outline-hidden transition-colors hover:text-gray-800 focus-visible:ring-3 focus-visible:ring-brand-500/20 dark:text-gray-400 dark:hover:text-white",
                variant === "line"
                  ? "-mb-px h-12 border-b-2 border-transparent"
                  : "h-9 rounded-md",
              )}
            >
              {moreLabel}
              <span className="rounded-full bg-gray-100 px-1.5 text-xs dark:bg-white/10">
                {hidden.length}
              </span>
              <ChevronDownIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 p-1.5">
              {hidden.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  onClick={() => onValueChange(item.value)}
                >
                  {item.menuLabel ?? item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TabsList>
    </div>
  );
}

export { OverflowTabsList };
