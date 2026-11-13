import { useTranslations } from "@/i18n";
import { PlayIcon } from "@/icons";
import { categoryStyle } from "@/pages/main/library/sound-effects/category-style";
import { PauseIcon } from "@/pages/main/library/sound-effects/icons";
import {
  usePreviewPlayer,
  usePreviewState,
  type PreviewTrack,
} from "@/pages/main/library/sound-effects/preview-player";
import { cn } from "@/utils";
import { useEffect, useRef, type ReactNode } from "react";

interface SoundRowProps {
  /** The sound; its id must be unique across the page (the shared player tracks what's playing by it). */
  track: PreviewTrack;
  /** The list this row belongs to, for the player's previous/next. */
  queue?: PreviewTrack[];
  /** Right-hand action (save / delete). */
  action?: ReactNode;
}

/** "Now playing" bars on the cover tile. */
function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {["[animation-delay:-0.45s]", "[animation-delay:-0.15s]", "[animation-delay:-0.7s]"].map((delay) => (
        <span key={delay} className={cn("h-4 w-[3px] origin-bottom animate-equalizer rounded-full bg-white", delay)} />
      ))}
    </span>
  );
}

/** Thin progress line under the active row, moved every frame without re-rendering. */
function PreviewProgress() {
  const player = usePreviewPlayer();
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${player.progress()})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player]);

  return (
    <span className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
      <span
        ref={barRef}
        className="block h-full origin-left scale-x-0 bg-brand-500 rtl:origin-right dark:bg-brand-400"
      />
    </span>
  );
}

/** One sound in a story-picker style list: tap the row to preview, action on the right. */
export function SoundRow({ track, queue, action }: SoundRowProps) {
  const t = useTranslations("soundEffects.row");
  const player = usePreviewPlayer();
  const state = usePreviewState(track.id);
  const { title, subtitle } = track;
  const { gradient, Icon } = categoryStyle(track.categoryId);
  const active = state !== "idle";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]",
        active && "bg-gray-50 dark:bg-white/[0.05]",
      )}
    >
      <button
        type="button"
        onClick={() => player.toggle(track, queue)}
        aria-label={`${state === "playing" ? t("pause") : t("play")}: ${title}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-start outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/30"
      >
        <span
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br text-white shadow-theme-xs",
            gradient,
          )}
        >
          {state === "playing" ? (
            <>
              <span className="transition-opacity group-hover:opacity-0">
                <Equalizer />
              </span>
              <PauseIcon className="absolute size-5 opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          ) : state === "paused" ? (
            <PlayIcon className="size-5" />
          ) : (
            <>
              <Icon className="size-5 transition-opacity group-hover:opacity-0" />
              <PlayIcon className="absolute size-5 opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium text-gray-800 dark:text-white/90",
              active && "text-brand-600 dark:text-brand-400",
            )}
            title={title}
          >
            {title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
        </span>
      </button>
      {action}
      {active && <PreviewProgress />}
    </div>
  );
}

/** Round icon button for a row's right-hand action. */
export function RowActionButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-default disabled:opacity-60 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200",
        active && "text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300",
      )}
    >
      {children}
    </button>
  );
}
