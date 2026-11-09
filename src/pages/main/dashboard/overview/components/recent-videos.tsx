import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { PlayIcon, PlusIcon } from "@/icons";
import { studioUrl } from "@/lib/paths";
import type { VideoSummary } from "@shared/types";
import { Link } from "react-router";

/** The videos touched most recently — one click back into the studio. */
export default function RecentVideos({
  data,
  onNewVideo,
}: {
  data: VideoSummary[];
  onNewVideo: () => void;
}) {
  const t = useTranslations("overview.recentVideos");
  const tProjects = useTranslations("projects");

  return (
    <div className="card-surface px-4 pt-4 pb-4 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("title")}
        </h3>
        <Button type="button" onClick={onNewVideo}>
          <PlusIcon className="size-4" />
          {tProjects("newVideo.button")}
        </Button>
      </div>

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.map((video) => (
            <Link
              key={video.id}
              to={studioUrl(video.id)}
              className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
                <PlayIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {video.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {t("location", {
                    project: video.projectName,
                    category: video.categoryName,
                  })}
                </p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {t("updatedAt", {
                    date: new Date(video.updatedAt).toLocaleDateString(),
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
