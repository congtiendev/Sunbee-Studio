import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { TrashBinIcon } from "@/icons";
import { CategoryChips } from "@/pages/main/library/sound-effects/category-chips";
import { searchable, systemCategoryOf } from "@/pages/main/library/sound-effects/category-style";
import { BookmarkFilledIcon } from "@/pages/main/library/sound-effects/icons";
import { PagedList } from "@/pages/main/library/sound-effects/paged-list";
import type { PreviewTrack } from "@/pages/main/library/sound-effects/preview-player";
import { RowActionButton, SoundRow } from "@/pages/main/library/sound-effects/sound-row";
import type { LibraryAsset } from "@shared/types";
import { useMemo, useState } from "react";

const ALL = "all";
const UNCATEGORIZED = "__uncategorized__";

interface SavedTabProps {
  assets: LibraryAsset[];
  query: string;
  pendingIds: Set<string>;
  /** Un-bookmarks a sound saved from the system library (no confirmation, like a story picker). */
  onUnsave: (asset: LibraryAsset) => void;
  /** Deletes any other sound (pack installs, uploads) — the page confirms first. */
  onDelete: (asset: LibraryAsset) => void;
}

/** "Saved" tab: the user's own sound library, filterable by its folders. */
export function SavedTab({ assets, query, pendingIds, onUnsave, onDelete }: SavedTabProps) {
  const t = useTranslations("soundEffects");
  const [category, setCategory] = useState(ALL);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const key = asset.category ?? UNCATEGORIZED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets]);

  // A folder can empty out after deletes — fall back to "all" instead of showing nothing.
  const activeCategory = category === ALL || categories.some(([key]) => key === category) ? category : ALL;
  const needle = searchable(query.trim());
  const results = assets.filter((asset) => {
    if (activeCategory !== ALL && (asset.category ?? UNCATEGORIZED) !== activeCategory) return false;
    if (!needle) return true;
    const hay = searchable(`${asset.name} ${asset.tags.join(" ")} ${asset.category ?? ""}`);
    return needle.split(/\s+/).every((word) => hay.includes(word));
  });

  const queue = results.map(
    (asset): PreviewTrack => ({
      id: `asset:${asset.id}`,
      src: `/api/files/${asset.fileId}`,
      title: asset.name,
      subtitle: asset.category ?? t("saved.uncategorized"),
      categoryId: systemCategoryOf(asset.sourcePackId),
    }),
  );

  if (assets.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("saved.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <CategoryChips
        value={activeCategory}
        onChange={setCategory}
        items={[
          { value: ALL, label: t("browse.all"), count: assets.length },
          ...categories.map(([key, count]) => ({
            value: key,
            label: key === UNCATEGORIZED ? t("saved.uncategorized") : key,
            count,
          })),
        ]}
      />
      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("browse.empty")}</p>
      ) : (
        <PagedList
          key={`${activeCategory}|${needle}`}
          items={results.map((asset, index) => ({ asset, track: queue[index] }))}
          render={({ asset, track }) => {
            const fromSystem = track.categoryId;
            const pending = pendingIds.has(asset.id);
            return (
              <SoundRow
                key={asset.id}
                track={track}
                queue={queue}
                action={
                  fromSystem ? (
                    <RowActionButton label={t("row.unsave")} active disabled={pending} onClick={() => onUnsave(asset)}>
                      {pending ? <Spinner /> : <BookmarkFilledIcon className="size-5" />}
                    </RowActionButton>
                  ) : (
                    <RowActionButton label={t("deleteButton")} onClick={() => onDelete(asset)}>
                      <TrashBinIcon className="size-4" />
                    </RowActionButton>
                  )
                }
              />
            );
          }}
        />
      )}
    </div>
  );
}
