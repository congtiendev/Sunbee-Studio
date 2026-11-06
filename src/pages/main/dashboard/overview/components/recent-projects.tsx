import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { FolderIcon } from "@/icons";
import type { Project } from "@shared/types";
import { Link } from "react-router";

export default function RecentProjects({ data }: { data: Project[] }) {
  const t = useTranslations("overview.recentProjects");
  const tCommon = useTranslations("common");

  const rows = data.slice(0, 6);

  return (
    <div className="card-surface overflow-hidden px-4 pt-4 pb-3 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("title")}
        </h3>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/video-studio" />}
        >
          {tCommon("seeAll")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((project) => (
            <li key={project.id} className="flex items-center gap-3 py-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
                <FolderIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {project.name}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t("updatedAt", {
                    date: new Date(project.updatedAt).toLocaleDateString(),
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
