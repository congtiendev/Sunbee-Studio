import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import { useEffect, useRef } from "react";

/**
 * The right-hand pane of the script block, previewing one captured frame
 * large, like a video editor's inspector — opens when a frame is clicked in
 * `FramesStrip`, with prev/next navigation to step through the rest without
 * closing it. Collapses to zero width when closed; a border-start divider
 * (not its own card) separates it from the script pane beside it.
 */
export default function FramePreviewPanel({
  open,
  onOpenChange,
  frame,
  index,
  total,
  passage,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frame: string | null;
  index: number | null;
  total: number;
  passage: string | null;
  onNavigate: (delta: number) => void;
}) {
  const t = useTranslations("videoStudio.script");
  const panelRef = useRef<HTMLDivElement>(null);

  // Not a dialog (no backdrop, no focus trap) — just move focus in so arrow
  // keys navigate frames right away, without requiring an extra click.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div
      // Closed, the panel is a zero-width clip; `relative` makes it the containing
      // block of the panel's absolutely positioned bits (e.g. sr-only labels) so they
      // are clipped too instead of widening the page. `inert` keeps them out of Tab.
      inert={!open}
      className={cn(
        "relative h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
        open
          ? "w-full border-s border-gray-200 sm:w-[22rem] dark:border-gray-800"
          : "w-0",
      )}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
          if (e.key === "ArrowLeft") onNavigate(-1);
          if (e.key === "ArrowRight") onNavigate(1);
        }}
        className="flex h-full w-full flex-col outline-none sm:w-[22rem]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
            {index !== null
              ? t("frameLabel", {
                  index: String(index + 1),
                  count: String(total),
                })
              : t("previewTitle")}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-950 dark:border-gray-800">
            {frame && (
              <img src={frame} alt="" className="size-full object-contain" />
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {passage ?? t("previewPassageEmpty")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === null || index === 0}
            onClick={() => onNavigate(-1)}
          >
            <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            {t("framePrev")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === null || index === total - 1}
            onClick={() => onNavigate(1)}
          >
            {t("frameNext")}
            <ChevronRightIcon className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
