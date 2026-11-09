import { useTranslations } from "@/i18n";
import { FolderIcon, PlayIcon, PlusIcon } from "@/icons";
import { studioUrl } from "@/lib/paths";
import type { Category, VideoSummary } from "@shared/types";
import { Link } from "react-router";
import ItemActionsMenu from "@/pages/main/projects/item-actions-menu";

interface CategorySectionProps {
  category: Category;
  videos: VideoSummary[];
  onAddVideo: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRenameVideo: (video: VideoSummary) => void;
  onDeleteVideo: (video: VideoSummary) => void;
}

/** One category of a project: its header and a grid of its videos. */
export default function CategorySection({
  category,
  videos,
  onAddVideo,
  onRename,
  onDelete,
  onRenameVideo,
  onDeleteVideo,
}: CategorySectionProps) {
  const t = useTranslations("projects.detail");

  return (
    <section className="card-surface p-4 sm:p-5">
      <header className="mb-4 flex items-center gap-2">
        <FolderIcon className="size-5 shrink-0 text-gray-400" />
        <h3 className="min-w-0 truncate font-medium text-gray-800 dark:text-white/90">
          {category.name}
        </h3>
        <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
          {t("videoCount", { count: videos.length })}
        </span>
        <ItemActionsMenu
          label={category.name}
          onRename={onRename}
          onDelete={onDelete}
          className="ms-auto"
        />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onRename={() => onRenameVideo(video)}
            onDelete={() => onDeleteVideo(video)}
          />
        ))}
        <button
          type="button"
          onClick={onAddVideo}
          className="flex min-h-18 items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500/60 dark:hover:text-brand-400"
        >
          <PlusIcon className="size-4" />
          {t("addVideo")}
        </button>
      </div>

      {videos.length === 0 && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {t("emptyCategory")}
        </p>
      )}
    </section>
  );
}

function VideoCard({
  video,
  onRename,
  onDelete,
}: {
  video: VideoSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("projects");

  return (
    <div className="relative flex min-h-18 items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <PlayIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        {/* Stretched link: the whole card opens the video; the menu sits above it. */}
        <Link
          to={studioUrl(video.id)}
          className="block truncate text-sm font-medium text-gray-800 after:absolute after:inset-0 after:rounded-xl dark:text-white/90"
        >
          {video.name}
        </Link>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {t("updatedAt", {
            date: new Date(video.updatedAt).toLocaleDateString(),
          })}
        </p>
      </div>
      <ItemActionsMenu
        label={video.name}
        onRename={onRename}
        onDelete={onDelete}
        className="relative z-10"
      />
    </div>
  );
}
