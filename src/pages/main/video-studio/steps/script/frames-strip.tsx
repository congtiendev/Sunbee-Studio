import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AspectFullscreenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/icons";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Thumbnails of the frames sampled from the source video. Clicking one
 * selects it (the script highlights the matching passage); the corner
 * button opens it full size, with the passage and prev/next navigation.
 */
export default function FramesStrip({
  frames,
  activeIndex,
  onSelect,
  passageOf,
}: {
  frames: string[];
  activeIndex: number | null;
  /** `focus`: move the caret to the passage (not while the dialog is open). */
  onSelect: (index: number, focus: boolean) => void;
  /** The script passage matched to a frame, shown under the zoomed image. */
  passageOf: (index: number) => string | null;
}) {
  const t = useTranslations("videoStudio.script");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected thumbnail in view (e.g. after prev/next in the dialog).
  useEffect(() => {
    if (activeIndex === null) return;
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-frame-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  if (frames.length === 0) return null;

  const go = (delta: number) => {
    if (previewIndex === null) return;
    const next = Math.min(frames.length - 1, Math.max(0, previewIndex + delta));
    setPreviewIndex(next);
    onSelect(next, false);
  };
  const passage = previewIndex !== null ? passageOf(previewIndex) : null;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {t("framesCaptured", { count: String(frames.length) })}{" "}
        {t("framesClickHint")}
      </p>
      <div ref={stripRef} className="flex gap-2 overflow-x-auto p-1">
        {frames.map((frame, i) => (
          <div key={i} data-frame-index={i} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect(i, true)}
              onDoubleClick={() => setPreviewIndex(i)}
              aria-pressed={activeIndex === i}
              aria-label={t("frameLabel", {
                index: String(i + 1),
                count: String(frames.length),
              })}
              className={cn(
                "block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                activeIndex === i &&
                  "ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-brand-400 dark:ring-offset-gray-900",
              )}
            >
              <img
                src={frame}
                alt=""
                className="h-16 w-28 rounded-md border border-gray-200 object-cover dark:border-gray-800"
              />
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(i, false);
                setPreviewIndex(i);
              }}
              aria-label={t("frameZoom")}
              title={t("frameZoom")}
              className="absolute inset-e-1 top-1 flex size-6 items-center justify-center rounded bg-black/55 text-white transition-opacity outline-none hover:bg-black/75 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
            >
              <AspectFullscreenIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Dialog
        open={previewIndex !== null}
        onOpenChange={(open) => !open && setPreviewIndex(null)}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden sm:max-w-4xl"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
        >
          {previewIndex !== null && (
            <>
              <DialogTitle className="pe-8 text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("frameLabel", {
                  index: String(previewIndex + 1),
                  count: String(frames.length),
                })}
              </DialogTitle>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <img
                  src={frames[previewIndex]}
                  alt=""
                  className="max-h-[calc(100dvh-16rem)] max-w-full rounded-lg object-contain"
                />
              </div>
              {passage && (
                <p className="max-h-24 shrink-0 overflow-y-auto rounded-lg bg-brand-50 px-3 py-2 text-sm leading-relaxed text-gray-700 dark:bg-brand-500/15 dark:text-gray-200">
                  {passage}
                </p>
              )}
              <div className="flex shrink-0 items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={previewIndex === 0}
                  onClick={() => go(-1)}
                >
                  <ChevronLeftIcon className="size-4 rtl:rotate-180" />
                  {t("framePrev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={previewIndex === frames.length - 1}
                  onClick={() => go(1)}
                >
                  {t("frameNext")}
                  <ChevronRightIcon className="size-4 rtl:rotate-180" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
