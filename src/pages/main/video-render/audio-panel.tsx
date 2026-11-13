import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/i18n";
import { ArrowRightIcon, PlusIcon, SearchIcon, TrashBinIcon, XIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { paths } from "@/lib/paths";
import { systemCategoryOf } from "@/pages/main/library/sound-effects/category-style";
import type { PreviewTrack } from "@/pages/main/library/sound-effects/preview-player";
import { RowActionButton, SoundRow } from "@/pages/main/library/sound-effects/sound-row";
import type { RenderProjectState } from "@/pages/main/video-render/use-render-project";
import { RENDER_FPS } from "@shared/frame-ratio";
import type { LibraryAsset, RenderManifestAudioTrack } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

const TRACKS: RenderManifestAudioTrack[] = ["bgm", "sfx"];
const MAX_RESULTS = 30;

/** A small number field with its unit inside, for the cue's start time and gain. */
function UnitInput({
  label,
  unit,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="relative">
        <Input
          type="number"
          min={min}
          step={step}
          className="h-9 w-24 pe-8"
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && (min === undefined || next >= min)) onChange(next);
          }}
        />
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
          {unit}
        </span>
      </span>
    </label>
  );
}

/** Step 3: music and sound-effect cues from the user's audio library, each previewable and placed by start time. */
export default function AudioPanel({ state }: { state: RenderProjectState }) {
  const t = useTranslations("videoRender.audio");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryAsset[] | null>(null);
  const fps = RENDER_FPS;
  const cues = state.project?.audio ?? [];

  useEffect(() => {
    let active = true;
    const id = setTimeout(() => {
      void apiClient.assets.library
        .list({ q: query.trim() || undefined, type: "audio" })
        .then((assets) => active && setResults(assets.slice(0, MAX_RESULTS)))
        .catch(() => active && setResults([]));
    }, 300);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query]);

  const cueQueue = useMemo(
    () =>
      cues.map(
        (cue, index): PreviewTrack => ({
          id: `cue:${index}:${cue.fileId}`,
          src: `/api/files/${cue.fileId}`,
          title: cue.label ?? cue.fileId,
          subtitle: t(`tracks.${cue.track}`),
          categoryId: cue.track === "bgm" ? "music" : undefined,
        }),
      ),
    [cues, t],
  );

  const libraryQueue = useMemo(
    () =>
      (results ?? []).map(
        (asset): PreviewTrack => ({
          id: `library:${asset.id}`,
          src: `/api/files/${asset.fileId}`,
          title: asset.name,
          subtitle: asset.category ?? asset.tags.join(" · "),
          categoryId: systemCategoryOf(asset.sourcePackId),
        }),
      ),
    [results],
  );

  if (!state.project) return null;

  return (
    <Card className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{t("title")}</CardTitle>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("hint")}</p>
        </div>
        <Link
          to={paths.librarySoundEffects}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {t("openLibrary")}
          <ArrowRightIcon className="size-4 rtl:rotate-180" />
        </Link>
      </div>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          {t("inVideo", { count: cues.length })}
        </h4>
        {cues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cues.map((cue, index) => (
              <li
                key={`${cue.fileId}-${index}`}
                className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-2 lg:flex-row lg:items-end dark:border-gray-800"
              >
                <div className="min-w-0 flex-1 self-stretch lg:self-center">
                  <SoundRow track={cueQueue[index]!} queue={cueQueue} />
                </div>
                <div className="flex flex-wrap items-end gap-3 px-2 pb-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{t("trackLabel")}</span>
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      value={[cue.track]}
                      onValueChange={(value) => {
                        const next = value[0] as RenderManifestAudioTrack | undefined;
                        if (next) state.updateAudio(index, { track: next });
                      }}
                    >
                      {TRACKS.map((track) => (
                        <ToggleGroupItem key={track} value={track} className="px-2.5 text-xs">
                          {t(`tracks.${track}`)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <UnitInput
                    label={t("startLabel")}
                    unit="s"
                    min={0}
                    step={0.1}
                    value={Number((cue.from / fps).toFixed(2))}
                    onChange={(seconds) => state.updateAudio(index, { from: Math.round(seconds * fps) })}
                  />
                  <UnitInput
                    label={t("gainLabel")}
                    unit="dB"
                    step={1}
                    value={cue.gainDb ?? 0}
                    onChange={(gainDb) => state.updateAudio(index, { gainDb })}
                  />
                  <RowActionButton label={t("remove")} onClick={() => state.removeAudio(index)}>
                    <TrashBinIcon className="size-4" />
                  </RowActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">{t("fromLibrary")}</h4>
        <div className="relative mb-2">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 rounded-full border-transparent bg-gray-100 ps-12 pe-11 shadow-none [&::-webkit-search-cancel-button]:hidden dark:border-transparent dark:bg-white/[0.06]"
          />
          {query && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              onClick={() => setQuery("")}
              className="absolute end-3 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        {results === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t("noResults")}</p>
        ) : (
          <div className="custom-scrollbar -mx-1 grid max-h-[28rem] grid-cols-1 gap-x-4 overflow-y-auto px-1 2xl:grid-cols-2">
            {results.map((asset, index) => (
              <SoundRow
                key={asset.id}
                track={libraryQueue[index]!}
                queue={libraryQueue}
                action={
                  <RowActionButton label={t("add")} onClick={() => state.addAudio(asset)}>
                    <PlusIcon className="size-5" />
                  </RowActionButton>
                }
              />
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}
