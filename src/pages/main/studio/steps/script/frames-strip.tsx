import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import { useEffect, useRef, useState } from "react";

/**
 * A horizontal filmstrip of the frames sampled from the source video.
 * Click one to select it — the script highlights the matching passage and
 * a preview sidebar opens. Drag horizontally to scrub through them.
 */
export default function FramesStrip({
  frames,
  activeIndex,
  onSelect,
}: {
  frames: string[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("videoStudio.script");
  const stripRef = useRef<HTMLDivElement>(null);

  // Edge fades hint that there's more to drag to — with no scrollbar and no
  // wheel-scroll, that's otherwise invisible.
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Drag-to-scroll, the plain mousedown/mousemove/mouseup way (not Pointer
  // Capture — that redirects pointer events to the strip, but some browsers
  // then also retarget the *click* that follows, which silently ate clicks
  // on the thumbnails underneath). Listeners are only attached to `window`
  // while actually dragging.
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const dragMoved = useRef(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!stripRef.current) return;
      const delta = e.clientX - dragStartX.current;
      if (Math.abs(delta) > 3) dragMoved.current = true;
      stripRef.current.scrollLeft = dragStartScrollLeft.current - delta;
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    const strip = stripRef.current;
    const handleDown = (e: MouseEvent) => {
      if (e.button !== 0 || !strip) return;
      dragStartX.current = e.clientX;
      dragStartScrollLeft.current = strip.scrollLeft;
      dragMoved.current = false;
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    };
    strip?.addEventListener("mousedown", handleDown);

    // Dragging is the only way to scroll this strip — wheel/trackpad
    // scrolling is disabled so it doesn't fight with the page's own
    // scroll. (React's wheel listener is passive by default, so this is
    // attached natively with `{ passive: false }` to make preventDefault
    // actually take effect.)
    const handleWheel = (e: WheelEvent) => e.preventDefault();
    strip?.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      strip?.removeEventListener("mousedown", handleDown);
      strip?.removeEventListener("wheel", handleWheel);
    };
    // `frames` isn't used directly, but the strip only renders (so
    // `stripRef` only attaches to a real node) once frames arrive — frames
    // load asynchronously after mount, so this must re-run when they do.
  }, [frames]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const updateEdges = () => {
      setCanScrollLeft(strip.scrollLeft > 1);
      setCanScrollRight(
        strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      );
    };
    updateEdges();

    strip.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(strip);
    return () => {
      strip.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, [frames]);

  const handleThumbnailClick = (index: number) => {
    // A drag ends with a click too; skip just that one so it doesn't also
    // select a frame.
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    onSelect(index);
  };

  // Keep the selected thumbnail in view (e.g. after prev/next in the sheet).
  // Scroll the strip itself only: scrollIntoView would also move the page.
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelector<HTMLElement>(
      `[data-frame-index="${activeIndex}"]`,
    );
    if (activeIndex === null || !strip || !thumb) return;
    const stripRect = strip.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    if (thumbRect.left < stripRect.left) {
      strip.scrollBy({ left: thumbRect.left - stripRect.left });
    } else if (thumbRect.right > stripRect.right) {
      strip.scrollBy({ left: thumbRect.right - stripRect.right });
    }
  }, [activeIndex]);

  if (frames.length === 0) return null;

  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {t("framesCaptured", { count: String(frames.length) })}{" "}
        {t("framesClickHint")}
      </p>
      <div className="relative min-w-0">
        {canScrollLeft && (
          <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-8 bg-gradient-to-r from-white to-transparent dark:from-gray-900" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-8 bg-gradient-to-l from-white to-transparent dark:from-gray-900" />
        )}
        <div
          ref={stripRef}
          className="no-scrollbar flex min-w-0 cursor-grab gap-2 overflow-x-auto p-1 select-none active:cursor-grabbing"
        >
          {frames.map((frame, i) => (
            <div key={i} data-frame-index={i} className="relative shrink-0">
              <button
                type="button"
                onClick={() => handleThumbnailClick(i)}
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
                  draggable={false}
                  className="h-16 w-28 rounded-md border border-gray-200 object-cover transition-transform hover:scale-105 dark:border-gray-800"
                />
              </button>
              <span className="pointer-events-none absolute inset-s-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 font-jetbrains-mono text-[10px] text-white">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
