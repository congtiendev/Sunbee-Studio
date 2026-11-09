import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { CheckCircleIcon, PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import type { RequiredAsset, RequiredAssetType, ScriptScene } from "@shared/types";
import { useState } from "react";
import ScenesList from "./scenes-list";

const ASSET_TYPES: RequiredAssetType[] = ["video", "image", "audio", "graphic"];

interface SceneEditorProps {
  scenes: ScriptScene[];
  approved: boolean;
  approving: boolean;
  /** False when the result isn't tied to a saved version (nothing to approve). */
  canApprove: boolean;
  onApprove: (scenes: ScriptScene[]) => Promise<boolean>;
}

/**
 * Scenes of the analysis, editable in place. "Save & approve" stores the edits
 * as a new approved version — approved versions are what skills learn from.
 */
export default function SceneEditor({
  scenes,
  approved,
  approving,
  canApprove,
  onApprove,
}: SceneEditorProps) {
  const t = useTranslations("videoStudio.script");
  const [draft, setDraft] = useState<ScriptScene[] | null>(null);

  const updateScene = (index: number, patch: Partial<ScriptScene>) =>
    setDraft((prev) => prev?.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)) ?? null);

  const updateAsset = (sceneIndex: number, assetIndex: number, patch: Partial<RequiredAsset>) =>
    setDraft(
      (prev) =>
        prev?.map((scene, i) =>
          i === sceneIndex
            ? {
                ...scene,
                requiredAssets: scene.requiredAssets.map((asset, j) =>
                  j === assetIndex ? { ...asset, ...patch } : asset,
                ),
              }
            : scene,
        ) ?? null,
    );

  const addAsset = (sceneIndex: number) =>
    setDraft(
      (prev) =>
        prev?.map((scene, i) =>
          i === sceneIndex
            ? {
                ...scene,
                requiredAssets: [
                  ...scene.requiredAssets,
                  { type: "video", description: "", source: "stock" } satisfies RequiredAsset,
                ],
              }
            : scene,
        ) ?? null,
    );

  const removeAsset = (sceneIndex: number, assetIndex: number) =>
    setDraft(
      (prev) =>
        prev?.map((scene, i) =>
          i === sceneIndex
            ? { ...scene, requiredAssets: scene.requiredAssets.filter((_, j) => j !== assetIndex) }
            : scene,
        ) ?? null,
    );

  const handleApprove = async () => {
    const edited = (draft ?? scenes).map((scene) => ({
      ...scene,
      requiredAssets: scene.requiredAssets.filter((asset) => asset.description.trim()),
    }));
    if (await onApprove(edited)) setDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {approved && !draft && (
          <Badge variant="light" color="success" className="gap-1">
            <CheckCircleIcon />
            {t("approve.approvedBadge")}
          </Badge>
        )}
        <div className="ms-auto flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
                {t("approve.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={approving || !canApprove}
                onClick={() => void handleApprove()}
              >
                {approving && <Spinner />}
                {t("approve.saveAndApprove")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setDraft(scenes)}
              >
                <PencilIcon className="size-4" />
                {t("approve.edit")}
              </Button>
              {!approved && (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={approving || !canApprove}
                  onClick={() => void handleApprove()}
                >
                  {approving ? <Spinner /> : <CheckCircleIcon className="size-4" />}
                  {t("approve.approve")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {!approved && !draft && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("approve.hint")}</p>
      )}

      {draft ? (
        <div className="space-y-4">
          {draft.map((scene, sceneIndex) => (
            <div
              key={scene.index}
              className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  #{scene.index}
                </span>
                <Badge variant="light" color="primary" size="sm">
                  {t(`narrativeRoles.${scene.narrativeRole}`)}
                </Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t(`shotSizes.${scene.shotSize}`)} · {t(`cameraMovements.${scene.cameraMovement}`)}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>{t("sceneContent")}</FieldLabel>
                  <Textarea
                    value={scene.content}
                    onChange={(e) => updateScene(sceneIndex, { content: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("sceneVisual")}</FieldLabel>
                  <Textarea
                    value={scene.visualDescription}
                    onChange={(e) =>
                      updateScene(sceneIndex, { visualDescription: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field className="w-32">
                <FieldLabel>{t("sceneDuration")}</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={scene.estimatedDurationSec}
                  onChange={(e) =>
                    updateScene(sceneIndex, {
                      estimatedDurationSec: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </Field>
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("sceneAssets")}
                </span>
                {scene.requiredAssets.map((asset, assetIndex) => (
                  <div key={assetIndex} className="flex items-center gap-2">
                    <Select
                      value={asset.type}
                      onValueChange={(value) =>
                        updateAsset(sceneIndex, assetIndex, { type: value as RequiredAssetType })
                      }
                    >
                      <SelectTrigger className="w-32 shrink-0">
                        <SelectValue>{() => t(`assetTypes.${asset.type}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`assetTypes.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={asset.description}
                      placeholder={t("approve.assetPlaceholder")}
                      onChange={(e) =>
                        updateAsset(sceneIndex, assetIndex, { description: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeAsset(sceneIndex, assetIndex)}
                    >
                      <TrashBinIcon className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addAsset(sceneIndex)}
                >
                  <PlusIcon className="size-4" />
                  {t("approve.addAsset")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ScenesList scenes={scenes} />
      )}
    </div>
  );
}
