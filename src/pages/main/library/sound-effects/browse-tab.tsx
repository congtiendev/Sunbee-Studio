import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { CategoryChips } from "@/pages/main/library/sound-effects/category-chips";
import {
  categoryLabel,
  categoryStyle,
  formatDuration,
  searchable,
} from "@/pages/main/library/sound-effects/category-style";
import { BookmarkFilledIcon, BookmarkIcon } from "@/pages/main/library/sound-effects/icons";
import { PagedList } from "@/pages/main/library/sound-effects/paged-list";
import type { PreviewTrack } from "@/pages/main/library/sound-effects/preview-player";
import { RowActionButton, SoundRow } from "@/pages/main/library/sound-effects/sound-row";
import { cn } from "@/utils";
import type { SystemSound, SystemSoundLibrary } from "@shared/types";
import { useMemo, useState } from "react";

const ALL = "all";

interface BrowseTabProps {
  library: SystemSoundLibrary;
  query: string;
  /** System sound ids already saved to the user's library. */
  savedIds: Set<string>;
  pendingIds: Set<string>;
  onToggleSave: (sound: SystemSound) => void;
}

/** "Explore" tab: the whole system library — pick a category or search, tap to preview, bookmark to save. */
export function BrowseTab({ library, query, savedIds, pendingIds, onToggleSave }: BrowseTabProps) {
  const t = useTranslations("soundEffects");
  const [category, setCategory] = useState(ALL);

  const labels = useMemo(
    () => new Map(library.categories.map((c) => [c.id, categoryLabel(t, c.id, c.title)])),
    [library.categories, t],
  );

  const needle = searchable(query.trim());
  const results = useMemo(() => {
    return library.sounds.filter((sound) => {
      if (category !== ALL && sound.category !== category) return false;
      if (!needle) return true;
      const hay = searchable(`${sound.name} ${sound.tags.join(" ")} ${labels.get(sound.category) ?? ""}`);
      return needle.split(/\s+/).every((word) => hay.includes(word));
    });
  }, [library.sounds, category, needle, labels]);

  const entries = useMemo(
    () =>
      results.map((sound) => ({
        sound,
        track: {
          id: `system:${sound.id}`,
          src: apiClient.assets.systemSounds.audioUrl(sound.id),
          title: sound.name,
          subtitle: `${labels.get(sound.category) ?? sound.category} · ${formatDuration(sound.duration)}`,
          categoryId: sound.category,
        } satisfies PreviewTrack,
      })),
    [results, labels],
  );
  const queue = useMemo(() => entries.map((entry) => entry.track), [entries]);

  if (library.sounds.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("browse.unavailable")}</p>;
  }

  const showTiles = category === ALL && !needle;
  const listTitle = needle
    ? t("browse.results")
    : category === ALL
      ? t("browse.allSounds")
      : (labels.get(category) ?? category);

  return (
    <div className="flex flex-col gap-5">
      <CategoryChips
        value={category}
        onChange={setCategory}
        items={[
          { value: ALL, label: t("browse.all") },
          ...library.categories.map((c) => ({ value: c.id, label: labels.get(c.id) ?? c.title, Icon: categoryStyle(c.id).Icon })),
        ]}
      />

      {showTiles && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">{t("browse.categories")}</h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
            {library.categories.map((c) => {
              const { gradient, Icon } = categoryStyle(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "group relative flex h-20 cursor-pointer flex-col justify-end overflow-hidden rounded-xl bg-linear-to-br p-3 text-start text-white shadow-theme-xs transition-transform hover:-translate-y-0.5",
                    gradient,
                  )}
                >
                  <Icon className="absolute end-2.5 top-2.5 size-6 opacity-40 transition-opacity group-hover:opacity-70" />
                  <span className="line-clamp-2 pe-7 text-sm leading-tight font-semibold">{labels.get(c.id)}</span>
                  <span className="mt-0.5 text-xs text-white/80">{t("packs.soundCount", { count: c.count })}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-1 flex items-baseline justify-between gap-2 px-2">
          <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{listTitle}</h3>
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
            {t("packs.soundCount", { count: results.length })}
          </span>
        </div>
        {results.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("browse.empty")}</p>
        ) : (
          <PagedList
            key={`${category}|${needle}`}
            items={entries}
            render={({ sound, track }) => {
              const saved = savedIds.has(sound.id);
              const pending = pendingIds.has(sound.id);
              return (
                <SoundRow
                  key={sound.id}
                  track={track}
                  queue={queue}
                  action={
                    <RowActionButton
                      label={saved ? t("row.unsave") : t("row.save")}
                      active={saved}
                      disabled={pending}
                      onClick={() => onToggleSave(sound)}
                    >
                      {pending ? (
                        <Spinner />
                      ) : saved ? (
                        <BookmarkFilledIcon className="size-5" />
                      ) : (
                        <BookmarkIcon className="size-5" />
                      )}
                    </RowActionButton>
                  }
                />
              );
            }}
          />
        )}
      </section>
    </div>
  );
}
