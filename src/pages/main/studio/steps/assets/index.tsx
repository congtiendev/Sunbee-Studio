import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress-bar";
import { useTranslations } from "@/i18n";
import { ListIcon, SearchIcon, StarFilledIcon, TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type {
  AssetCandidate,
  ResearchSourceInfo,
  SceneResource,
  SceneShot,
  ScriptAnalysisRecord,
  ScriptScene,
  StyleTemplate,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_FRAME_RATIO,
  FRAME_RATIOS,
  isFrameRatio,
} from "@shared/frame-ratio";
import type { FrameRatio } from "@shared/types";
import type { StepComponentProps } from "../registry";
import { useStepSave } from "../step-save";
import BatchPromptDialog from "./batch-prompt-dialog";
import CandidatePreview from "./candidate-preview";
import GraphicsSkillSelect, {
  NO_GRAPHICS_SKILL,
} from "./graphics-skill-select";
import ResearchSheet, { type ResearchTarget } from "./research-sheet";
import { blobToDataUrl } from "./scene-context";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const slotKey = (sceneIndex: number, assetIndex: number) =>
  `${sceneIndex}:${assetIndex}`;

/** A scene's assets under the shot each is for (scenes without shots: one group). */
function assetGroupsOf(scene: ScriptScene) {
  const items = scene.requiredAssets.map((asset, assetIndex) => ({
    asset,
    assetIndex,
  }));
  const shots = scene.shots ?? [];
  if (shots.length === 0)
    return [{ key: "all", shot: undefined as SceneShot | undefined, items }];
  const byShot = shots
    .map((shot) => ({
      key: `shot-${shot.order}`,
      shot: shot as SceneShot | undefined,
      items: items.filter((item) => item.asset.shot === shot.order),
    }))
    .filter((group) => group.items.length > 0);
  const rest = items.filter(
    (item) => !shots.some((shot) => shot.order === item.asset.shot),
  );
  return rest.length
    ? [...byShot, { key: "rest", shot: undefined, items: rest }]
    : byShot;
}

/** Step 2 — research and pick the media every scene needs. */
export default function AssetsStep({
  videoId,
  onComplete,
  onSaveChange,
}: StepComponentProps) {
  const t = useTranslations("videoStudio.assets");
  const tScript = useTranslations("videoStudio.script");

  const [version, setVersion] = useState<ScriptAnalysisRecord | null>(null);
  const [sources, setSources] = useState<ResearchSourceInfo[]>([]);
  const [selections, setSelections] = useState<SceneResource[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ResearchTarget | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [imageSkills, setImageSkills] = useState<StyleTemplate[]>([]);
  const [graphicsSkillId, setGraphicsSkillId] = useState(NO_GRAPHICS_SKILL);
  // Picks save themselves as they're made; the graphics skill choice is the
  // one thing here that waits for Save (kept in the account settings).
  const [savedGraphicsSkillId, setSavedGraphicsSkillId] =
    useState(NO_GRAPHICS_SKILL);
  // The video's frame shape, saved on the video itself (also with Save).
  const [frameRatio, setFrameRatio] = useState<FrameRatio>(DEFAULT_FRAME_RATIO);
  const [savedFrameRatio, setSavedFrameRatio] =
    useState<FrameRatio>(DEFAULT_FRAME_RATIO);
  const [savingSkill, setSavingSkill] = useState(false);
  const [skillSavedAt, setSkillSavedAt] = useState<Date | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [batchPromptOpen, setBatchPromptOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.script.history(videoId),
      apiClient.assets.sources(),
      apiClient.assets.selections(videoId),
      apiClient.templates.list(),
      apiClient.settings.get(),
      apiClient.videos.get(videoId),
    ])
      .then(([history, sourceList, picks, templates, settings, video]) => {
        if (!active) return;
        // The newest analyzed version is the one the scenes come from.
        setVersion(
          history.find((v) => v.kind === "analyzed" && v.scenes.length > 0) ??
            null,
        );
        const order = { library: 0, stock: 1, ai: 2 } as const;
        setSources(
          [...sourceList].sort((a, b) => order[a.kind] - order[b.kind]),
        );
        setSelections(picks);
        const skills = templates.filter((t) => t.type === "image");
        setImageSkills(skills);
        // A saved skill that has since been deleted falls back to none.
        const savedSkill = skills.some(
          (s) => s.id === settings.assetsGraphicsSkillId,
        )
          ? settings.assetsGraphicsSkillId!
          : NO_GRAPHICS_SKILL;
        setGraphicsSkillId(savedSkill);
        setSavedGraphicsSkillId(savedSkill);
        setFrameRatio(video.frameRatio ?? DEFAULT_FRAME_RATIO);
        setSavedFrameRatio(video.frameRatio ?? DEFAULT_FRAME_RATIO);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadedFor(videoId);
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  const bySlot = useMemo(
    () =>
      new Map(
        selections.map((pick) => [
          slotKey(pick.sceneIndex, pick.assetIndex),
          pick,
        ]),
      ),
    [selections],
  );
  // Stable reference across re-renders (not a fresh `?? []` every render) so
  // ResearchSheet's effects keyed on it don't re-fire unless it actually changed.
  const characterRoster = useMemo(
    () => version?.characterRoster ?? [],
    [version],
  );
  const objectRoster = useMemo(() => version?.objectRoster ?? [], [version]);
  const graphicsSkill = useMemo(
    () => imageSkills.find((skill) => skill.id === graphicsSkillId),
    [imageSkills, graphicsSkillId],
  );
  const graphicsStyle = graphicsSkill?.graphicsStyle;

  useStepSave(
    onSaveChange,
    {
      dirty:
        graphicsSkillId !== savedGraphicsSkillId ||
        frameRatio !== savedFrameRatio,
      saving: savingSkill,
      savedAt: skillSavedAt,
    },
    async () => {
      setSavingSkill(true);
      try {
        if (graphicsSkillId !== savedGraphicsSkillId) {
          await apiClient.settings.set({
            assetsGraphicsSkillId:
              graphicsSkillId === NO_GRAPHICS_SKILL ? "" : graphicsSkillId,
          });
          setSavedGraphicsSkillId(graphicsSkillId);
        }
        if (frameRatio !== savedFrameRatio) {
          await apiClient.videos.setFrameRatio(videoId, frameRatio);
          setSavedFrameRatio(frameRatio);
        }
        setSkillSavedAt(new Date());
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSavingSkill(false);
      }
    },
  );

  // The skill's reference illustrations (style only) — fetched once per skill
  // selection and described into every generation alongside graphicsStyle.
  const referenceImageFileIds = graphicsSkill?.referenceImageFileIds ?? [];
  useEffect(() => {
    let active = true;
    if (referenceImageFileIds.length === 0) {
      setReferenceImages([]);
      return;
    }
    Promise.all(
      referenceImageFileIds.map((fileId) =>
        fetch(apiClient.documents.fileUrl(fileId))
          .then((res) => res.blob())
          .then(blobToDataUrl),
      ),
    )
      .then((dataUrls) => {
        if (active) setReferenceImages(dataUrls);
      })
      .catch(() => {
        if (active) setReferenceImages([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids, not the array identity
  }, [referenceImageFileIds.join(",")]);
  const totalSlots =
    version?.scenes.reduce(
      (sum, scene) => sum + scene.requiredAssets.length,
      0,
    ) ?? 0;
  const filledSlots =
    version?.scenes.reduce(
      (sum, scene) =>
        sum +
        scene.requiredAssets.filter((_, i) =>
          bySlot.has(slotKey(scene.index, i)),
        ).length,
      0,
    ) ?? 0;

  const select = async (candidate: AssetCandidate) => {
    if (!target) return;
    try {
      const saved = await apiClient.assets.select({
        videoId,
        sceneIndex: target.scene.index,
        assetIndex: target.assetIndex,
        assetDescription: target.asset.description,
        candidate,
      });
      if (!saved) return;
      const next = [
        ...selections.filter(
          (pick) =>
            !(
              pick.sceneIndex === saved.sceneIndex &&
              pick.assetIndex === saved.assetIndex
            ),
        ),
        saved,
      ];
      setSelections(next);
      if (next.length >= totalSlots) onComplete();
      setTarget(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reloadSelections = () =>
    apiClient.assets
      .selections(videoId)
      .then((picks) => {
        setSelections(picks);
        if (picks.length >= totalSlots) onComplete();
      })
      .catch((err) => setError(errorMessage(err)));

  const clear = async (sceneIndex: number, assetIndex: number) => {
    const key = slotKey(sceneIndex, assetIndex);
    setClearing(key);
    try {
      await apiClient.assets.select({
        videoId,
        sceneIndex,
        assetIndex,
        assetDescription: "",
        candidate: null,
      });
      setSelections((prev) =>
        prev.filter(
          (pick) => slotKey(pick.sceneIndex, pick.assetIndex) !== key,
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(null);
    }
  };

  if (loadedFor !== videoId) {
    return (
      <div className="space-y-5">
        <SkeletonPanel className="h-10" />
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonPanel key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("noAnalysis")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <CardTitle>{t("title")}</CardTitle>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("description")}
          </p>
        </div>
        <div className="w-full sm:w-60">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {t("progressLabel")}
            </span>
            <span className="font-medium text-gray-800 tabular-nums dark:text-white/90">
              {filledSlots}/{totalSlots}
            </span>
          </div>
          <Progress
            value={
              totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0
            }
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Toolbar: what applies to every asset in this step. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
        <GraphicsSkillSelect
          skills={imageSkills}
          value={graphicsSkillId}
          onChange={setGraphicsSkillId}
          className="flex-1 basis-80"
        />
        <div className="flex items-center gap-2 self-start">
          <Label className="shrink-0">{t("frameRatioLabel")}</Label>
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[frameRatio]}
            onValueChange={(value) => {
              const next = value[0];
              if (isFrameRatio(next)) setFrameRatio(next);
            }}
          >
            {FRAME_RATIOS.map((ratio) => (
              <ToggleGroupItem
                key={ratio}
                value={ratio}
                title={t(`frameRatios.${ratio.replace(":", "x")}`)}
                className="px-2.5 font-jetbrains-mono text-xs"
              >
                {ratio}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button
          type="button"
          variant="outline"
          className="ms-auto gap-1.5 self-start"
          onClick={() => setBatchPromptOpen(true)}
        >
          <ListIcon className="size-4" />
          {t("batchPrompt.openButton")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {version.scenes.map((scene) => (
          <section
            key={scene.index}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {t("scene", { index: scene.index })}
              </span>
              {scene.heroMoment && (
                <StarFilledIcon className="size-3.5 text-yellow-400" />
              )}
              <Badge variant="light" color="primary" size="sm">
                {tScript(`narrativeRoles.${scene.narrativeRole}`)}
              </Badge>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {scene.estimatedDurationSec}s
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
              {scene.content}
            </p>

            {scene.requiredAssets.length === 0 ? (
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                {t("noAssets")}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {assetGroupsOf(scene).map((group) => (
                  <div key={group.key}>
                    {group.shot ? (
                      <p className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
                        <span className="font-semibold text-gray-800 dark:text-white/90">
                          {t("shotHeader", {
                            order: group.shot.order,
                            total: scene.shots?.length ?? 1,
                          })}
                        </span>
                        {" · "}
                        {tScript(`shotSizes.${group.shot.shotSize}`)} ·{" "}
                        {t(`shotAngles.${group.shot.angle}`)} ·{" "}
                        {group.shot.durationSec}s — {group.shot.subject}
                        {group.shot.technique?.trim() && (
                          <span className="ms-1 font-medium text-brand-600 dark:text-brand-400">
                            · {t("techniqueLabel")}: {group.shot.technique}
                          </span>
                        )}
                      </p>
                    ) : (
                      (scene.shots?.length ?? 0) > 0 && (
                        <p className="px-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t("otherAssets")}
                        </p>
                      )
                    )}
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.items.map(({ asset, assetIndex }) => {
                        const pick = bySlot.get(
                          slotKey(scene.index, assetIndex),
                        );
                        const outdated =
                          pick && pick.assetDescription !== asset.description;
                        return (
                          <li
                            key={assetIndex}
                            className="flex flex-wrap items-center gap-3 py-3"
                          >
                            <div className="min-w-0 flex-1 basis-60">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="light" color="gray" size="sm">
                                  {tScript(`assetTypes.${asset.type}`)}
                                </Badge>
                                <Badge variant="light" color="info" size="sm">
                                  {t(`assetSources.${asset.source}`)}
                                </Badge>
                                {asset.layer && (
                                  <Badge
                                    variant="light"
                                    color={
                                      asset.layer === "cutout"
                                        ? "warning"
                                        : "gray"
                                    }
                                    size="sm"
                                  >
                                    {t(`layerBadge.${asset.layer}`)}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                                {asset.description}
                              </p>
                              {asset.placement && (
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  {t("placementLabel")}: {asset.placement}
                                </p>
                              )}
                            </div>

                            {pick ? (
                              <div className="flex min-w-0 basis-72 items-center gap-2.5">
                                <CandidatePreview
                                  candidate={pick.candidate}
                                  compact
                                  className="h-12 w-20 shrink-0 rounded-lg"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium text-gray-800 dark:text-white/90">
                                    {pick.candidate.title}
                                  </p>
                                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                    {t(`sources.${pick.candidate.sourceKey}`, {
                                      defaultValue: pick.candidate.sourceKey,
                                    })}
                                    {pick.candidate.attribution
                                      ? ` · ${pick.candidate.attribution}`
                                      : ""}
                                  </p>
                                  {outdated && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                      {t("outdated")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="basis-72 text-xs text-gray-400 dark:text-gray-500">
                                {t("notPicked")}
                              </span>
                            )}

                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={pick ? "outline" : "default"}
                                className="gap-1.5"
                                onClick={() =>
                                  setTarget({ scene, assetIndex, asset })
                                }
                              >
                                <SearchIcon className="size-4" />
                                {t(pick ? "change" : "research.open")}
                              </Button>
                              {pick && (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  title={t("remove")}
                                  disabled={
                                    clearing ===
                                    slotKey(scene.index, assetIndex)
                                  }
                                  onClick={() =>
                                    void clear(scene.index, assetIndex)
                                  }
                                >
                                  <TrashBinIcon className="size-4" />
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <ResearchSheet
        target={target}
        sources={sources}
        selected={
          target
            ? bySlot.get(slotKey(target.scene.index, target.assetIndex))
                ?.candidate
            : undefined
        }
        characterRoster={characterRoster}
        objectRoster={objectRoster}
        graphicsStyle={graphicsStyle}
        referenceImages={referenceImages}
        frameRatio={frameRatio}
        onOpenChange={(open) => !open && setTarget(null)}
        onSelect={select}
      />

      {/* Remounted per frame: prompts written for another frame don't apply. */}
      <BatchPromptDialog
        key={frameRatio}
        open={batchPromptOpen}
        onOpenChange={setBatchPromptOpen}
        videoId={videoId}
        scenes={version.scenes}
        characterRoster={characterRoster}
        objectRoster={objectRoster}
        graphicsSkill={graphicsSkill}
        referenceImages={referenceImages}
        frameRatio={frameRatio}
        versionId={version.id}
        onScenesChanged={setVersion}
        onImported={reloadSelections}
      />
    </div>
  );
}
