import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BoxIcon, CameraIcon, ClockIcon, StarFilledIcon, UsersIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { RecurringCharacter, RecurringObject, ScriptScene } from "@shared/types";
import { useState } from "react";

const SECTION_LABEL =
  "text-[11px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500";

const AVATAR_COLORS = [
  "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
  "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  "bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400",
];

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words.at(-2)?.[0] ?? "") + (words.at(-1)?.[0] ?? words[0] ?? "")).toUpperCase();
}

function avatarColorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash]!;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A roster entry (character or object) as a small profile card: photo/avatar + locked appearance text. */
function RosterCard({ entry }: { entry: { name: string; appearance: string; appearanceImageFileId?: string } }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      {entry.appearanceImageFileId ? (
        <img
          src={apiClient.documents.fileUrl(entry.appearanceImageFileId)}
          alt=""
          className="size-14 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
        />
      ) : (
        <div
          className={`flex size-14 shrink-0 items-center justify-center rounded-full text-base font-semibold ${avatarColorFor(entry.name)}`}
        >
          {initialsOf(entry.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{entry.name}</p>
        <p className="mt-0.5 text-xs leading-relaxed break-words text-gray-600 dark:text-gray-400">
          {entry.appearance}
        </p>
      </div>
    </div>
  );
}

/**
 * The scene breakdown as a numbered storyboard: one card per scene, linked
 * by a timeline rail, each with its own labeled content/visual/assets
 * sections instead of cramming everything into dense table columns.
 */
export default function ScenesList({
  scenes,
  characterRoster = [],
  objectRoster = [],
}: {
  scenes: ScriptScene[];
  characterRoster?: RecurringCharacter[];
  objectRoster?: RecurringObject[];
}) {
  const t = useTranslations("videoStudio.script");
  const [rosterOpen, setRosterOpen] = useState(false);
  const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0);
  const characterCount = new Set(
    scenes.flatMap((s) => (s.characters ?? []).map((c) => c.name.trim().toLocaleLowerCase())),
  ).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span>{t("scenesCount", { count: String(scenes.length) })}</span>
        <span className="flex items-center gap-1">
          <ClockIcon className="size-3.5" />
          {t("scenesTotalDuration", { duration: formatDuration(totalDuration) })}
        </span>
        {characterCount > 0 && (
          <button
            type="button"
            onClick={() => setRosterOpen(true)}
            className="flex items-center gap-1 rounded hover:text-brand-500 hover:underline dark:hover:text-brand-400"
          >
            <UsersIcon className="size-3.5" />
            {t("scenesCharacterCount", { count: String(characterCount) })}
          </button>
        )}
        {objectRoster.length > 0 && (
          <button
            type="button"
            onClick={() => setRosterOpen(true)}
            className="flex items-center gap-1 rounded hover:text-brand-500 hover:underline dark:hover:text-brand-400"
          >
            <BoxIcon className="size-3.5" />
            {t("scenesObjectCount", { count: String(objectRoster.length) })}
          </button>
        )}
      </div>

      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("characterRosterTitle")}</DialogTitle>
          </DialogHeader>
          <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto">
            {characterRoster.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {t("characterRosterSection")}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("characterRosterHint")}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {characterRoster.map((character) => (
                    <RosterCard key={character.name} entry={character} />
                  ))}
                </div>
              </section>
            )}
            {objectRoster.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {t("objectRosterSection")}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("objectRosterHint")}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {objectRoster.map((object) => (
                    <RosterCard key={object.name} entry={object} />
                  ))}
                </div>
              </section>
            )}
            {characterRoster.length === 0 && objectRoster.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("characterRosterEmpty")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col">
        {scenes.map((scene, i) => (
          <div key={scene.index} className="flex gap-3">
            <div className="flex w-8 shrink-0 flex-col items-center">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                {scene.index}
              </div>
              {i < scenes.length - 1 && (
                <div className="my-1 w-px flex-1 bg-gray-200 dark:bg-gray-800" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="light" color="primary" size="sm">
                      {t(`narrativeRoles.${scene.narrativeRole}`)}
                    </Badge>
                    {scene.heroMoment && (
                      <Badge variant="light" color="warning" size="sm" className="gap-1">
                        <StarFilledIcon className="size-3" />
                        {t("heroMoment")}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <CameraIcon className="size-3.5" />
                      {t(`shotSizes.${scene.shotSize}`)} ·{" "}
                      {t(`cameraMovements.${scene.cameraMovement}`)}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <ClockIcon className="size-3.5" />
                    {scene.estimatedDurationSec}s
                  </span>
                </div>

                <div className="mt-3">
                  <span className={SECTION_LABEL}>{t("sceneContent")}</span>
                  <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-white/90">
                    {scene.content}
                  </p>
                </div>

                <div className="mt-3">
                  <span className={SECTION_LABEL}>{t("sceneVisual")}</span>
                  <p className="mt-1 rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                    {scene.visualDescription}
                  </p>
                </div>

                {scene.characters && scene.characters.length > 0 && (
                  <div className="mt-3">
                    <span className={SECTION_LABEL}>{t("sceneCharacters")}</span>
                    <ul className="mt-1.5 space-y-1.5">
                      {scene.characters.map((character, characterIndex) => (
                        <li key={characterIndex} className="flex items-start gap-1.5">
                          <Badge variant="light" color="primary" size="sm" className="mt-0.5 shrink-0">
                            {character.name}
                          </Badge>
                          <span className="min-w-0 flex-1 text-sm leading-relaxed break-words text-gray-600 dark:text-gray-400">
                            {character.action}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {scene.requiredAssets.length > 0 && (
                  <div className="mt-3">
                    <span className={SECTION_LABEL}>{t("sceneAssets")}</span>
                    <ul className="mt-1.5 space-y-1.5">
                      {scene.requiredAssets.map((asset, assetIndex) => (
                        <li key={assetIndex} className="flex items-start gap-1.5">
                          <Badge variant="light" color="gray" size="sm" className="mt-0.5 shrink-0">
                            {t(`assetTypes.${asset.type}`)}
                          </Badge>
                          <span className="min-w-0 flex-1 text-sm leading-relaxed break-words text-gray-600 dark:text-gray-400">
                            {asset.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
