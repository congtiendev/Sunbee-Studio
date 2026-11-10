import { Badge } from "@/components/ui/badge";
import { CameraIcon, ClockIcon, StarFilledIcon, UsersIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import type { RecurringCharacter, ScriptScene } from "@shared/types";

const SECTION_LABEL =
  "text-[11px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500";

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The scene breakdown as a numbered storyboard: one card per scene, linked
 * by a timeline rail, each with its own labeled content/visual/assets
 * sections instead of cramming everything into dense table columns.
 */
export default function ScenesList({
  scenes,
  characterRoster = [],
}: {
  scenes: ScriptScene[];
  characterRoster?: RecurringCharacter[];
}) {
  const t = useTranslations("videoStudio.script");
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
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3.5" />
            {t("scenesCharacterCount", { count: String(characterCount) })}
          </span>
        )}
      </div>

      {characterRoster.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <span className={SECTION_LABEL}>{t("characterRosterTitle")}</span>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t("characterRosterHint")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {characterRoster.map((character) => (
              <li key={character.name} className="flex items-start gap-1.5">
                <Badge variant="light" color="primary" size="sm" className="mt-0.5 shrink-0">
                  {character.name}
                </Badge>
                <span className="min-w-0 flex-1 text-sm leading-relaxed break-words text-gray-600 dark:text-gray-400">
                  {character.appearance}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
