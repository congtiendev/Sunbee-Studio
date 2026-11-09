import { LinkIcon, MusicIcon } from "@/icons";
import { cn } from "@/utils";
import type { AssetCandidate } from "@shared/types";

function hostOf(url: string): string {
  try {
    return new URL(url, window.location.origin).host;
  } catch {
    return url;
  }
}

/** The visual of one asset candidate: image, video, audio player, or a link tile. */
export default function CandidatePreview({
  candidate,
  className,
  compact = false,
}: {
  candidate: Pick<AssetCandidate, "mediaType" | "previewUrl" | "url" | "title">;
  className?: string;
  /** Small thumbnail (no audio controls). */
  compact?: boolean;
}) {
  const frame = cn(
    "flex items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-800",
    className,
  );

  if (candidate.mediaType === "image" || (candidate.mediaType === "video" && candidate.previewUrl)) {
    return (
      <div className={frame}>
        <img
          src={candidate.previewUrl ?? candidate.url}
          alt={candidate.title}
          loading="lazy"
          className="size-full object-cover"
        />
      </div>
    );
  }
  if (candidate.mediaType === "video") {
    return (
      <div className={frame}>
        <video src={candidate.url} muted preload="metadata" className="size-full object-cover" />
      </div>
    );
  }
  if (candidate.mediaType === "audio") {
    return (
      <div className={cn(frame, "flex-col gap-2 p-2")}>
        <MusicIcon className="size-6 text-gray-400" />
        {!compact && <audio src={candidate.url} controls preload="none" className="w-full" />}
      </div>
    );
  }
  return (
    <div className={cn(frame, "flex-col gap-1 p-2 text-center")}>
      <LinkIcon className="size-5 text-gray-400" />
      {!compact && (
        <span className="w-full truncate text-xs text-gray-500 dark:text-gray-400">{hostOf(candidate.url)}</span>
      )}
    </div>
  );
}
