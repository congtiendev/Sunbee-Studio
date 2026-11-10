import { SkeletonLines } from "@/components/shared/skeleton-blocks";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import type { ScriptAnalysisSummary } from "@shared/types";

/** Pick analyzed versions the skill learns from (approved ones are listed first by the API). */
export default function ExamplesPicker({
  options,
  loading,
  selected,
  onChange,
}: {
  options: ScriptAnalysisSummary[];
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("videoStudio.skills");

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));

  if (loading) {
    return <SkeletonLines count={3} />;
  }
  if (options.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{t("examples.empty")}</p>;
  }

  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pe-1 custom-scrollbar">
      {options.map((option) => {
        const checked = selected.includes(option.id);
        return (
          <label
            key={option.id}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
              checked
                ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={checked}
              onCheckedChange={(value) => toggle(option.id, value)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {option.videoName ?? t("examples.noVideo")}
                </span>
                {option.approved && (
                  <Badge variant="light" color="success" size="sm">
                    {t("examples.approved")}
                  </Badge>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t("examples.sceneCount", { count: option.sceneCount })}
                  {option.genre ? ` · ${option.genre}` : ""}
                  {` · ${new Date(option.createdAt).toLocaleDateString()}`}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                {option.scriptExcerpt}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
