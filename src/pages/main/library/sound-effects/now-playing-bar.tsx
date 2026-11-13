import { useTranslations } from "@/i18n";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, XIcon } from "@/icons";
import { categoryStyle, formatDuration } from "@/pages/main/library/sound-effects/category-style";
import { PauseIcon } from "@/pages/main/library/sound-effects/icons";
import { useNowPlaying, usePreviewPlayer } from "@/pages/main/library/sound-effects/preview-player";
import { cn } from "@/utils";
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Seek bar with elapsed/total time; moved every frame through refs, so it never re-renders while playing. */
function Scrubber({ label }: { label: string }) {
  const player = usePreviewPlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const { current, duration } = player.time();
      const fraction = player.progress();
      if (fillRef.current) fillRef.current.style.width = `${fraction * 100}%`;
      if (thumbRef.current) thumbRef.current.style.insetInlineStart = `${fraction * 100}%`;
      if (elapsedRef.current) elapsedRef.current.textContent = formatDuration(current);
      if (totalRef.current) totalRef.current.textContent = formatDuration(duration);
      trackRef.current?.setAttribute("aria-valuenow", String(Math.round(current)));
      trackRef.current?.setAttribute("aria-valuemax", String(Math.round(duration)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player]);

  const seekToPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const fraction = (rtl ? rect.right - event.clientX : event.clientX - rect.left) / rect.width;
    player.seek(fraction);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 2, ArrowUp: 2, ArrowLeft: -2, ArrowDown: -2 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      player.seekBy(step);
    } else if (event.key === "Home") player.seek(0);
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span ref={elapsedRef} className="w-9 shrink-0 text-end text-xs text-gray-500 tabular-nums dark:text-gray-400">
        0:00
      </span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekToPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekToPointer(event);
        }}
        className="group/scrub relative flex h-5 flex-1 cursor-pointer touch-none items-center rounded-full outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/30"
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
          <div ref={fillRef} className="h-full w-0 rounded-full bg-brand-500 dark:bg-brand-400" />
        </div>
        <div
          ref={thumbRef}
          className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-brand-500 opacity-0 shadow-theme-xs transition-opacity group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100 ltr:-translate-x-1/2 rtl:translate-x-1/2 dark:bg-brand-400"
        />
      </div>
      <span ref={totalRef} className="w-9 shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
        0:00
      </span>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  primary,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-35",
        primary
          ? "size-11 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          : "size-9 text-gray-600 hover:bg-gray-100 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.08]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The "now playing" player, pinned to the bottom of the viewport while a
 * sound is loaded: cover + title, previous / play-pause / next through the
 * list the sound was started from, a seek bar with times, and close.
 */
export function NowPlayingBar() {
  const t = useTranslations("soundEffects.player");
  const player = usePreviewPlayer();
  const { track, playing } = useNowPlaying();
  if (!track) return null;

  const { gradient, Icon } = categoryStyle(track.categoryId);
  const hasPrev = player.neighbour(-1) !== null;
  const hasNext = player.neighbour(1) !== null;

  return (
    // `me-16` keeps clear of the floating AI-assistant button in the bottom corner.
    <div className="sticky bottom-4 z-9 me-16 mt-4" role="region" aria-label={t("region")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-theme-lg backdrop-blur-md sm:grid-cols-[minmax(0,18rem)_auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-4 dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-white shadow-theme-xs",
              gradient,
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90" title={track.title}>
              {track.title}
            </span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{track.subtitle}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <ControlButton label={t("previous")} disabled={!hasPrev} onClick={() => player.skip(-1)} className="max-sm:hidden">
            <ChevronLeftIcon className="size-5 rtl:rotate-180" />
          </ControlButton>
          <ControlButton primary label={playing ? t("pause") : t("play")} onClick={() => player.togglePlayback()}>
            {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 ms-0.5" />}
          </ControlButton>
          <ControlButton label={t("next")} disabled={!hasNext} onClick={() => player.skip(1)} className="max-sm:hidden">
            <ChevronRightIcon className="size-5 rtl:rotate-180" />
          </ControlButton>
        </div>

        <div className="order-last col-span-full sm:order-none sm:col-span-1">
          <Scrubber label={t("seek")} />
        </div>

        <ControlButton label={t("close")} onClick={() => player.stop()}>
          <XIcon className="size-4" />
        </ControlButton>
      </div>
    </div>
  );
}
