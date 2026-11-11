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
import { CheckCircleIcon, PencilIcon, PlusIcon, TrashBinIcon, UploadIcon, XIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type {
  RecurringCharacter,
  RecurringObject,
  RequiredAsset,
  RequiredAssetType,
  ScriptScene,
} from "@shared/types";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import ScenesList from "./scenes-list";

const ASSET_TYPES: RequiredAssetType[] = ["video", "image", "audio", "graphic"];

type RosterEntry = { name: string; appearance: string; appearanceImageFileId?: string };

interface SceneEditorProps {
  scenes: ScriptScene[];
  characterRoster: RecurringCharacter[];
  objectRoster: RecurringObject[];
  approved: boolean;
  approving: boolean;
  /** False when the result isn't tied to a saved version (nothing to approve). */
  canApprove: boolean;
  onApprove: (
    scenes: ScriptScene[],
    characterRoster: RecurringCharacter[],
    objectRoster: RecurringObject[],
  ) => Promise<boolean>;
  /**
   * For the studio's Save button: true while scene edits are open, and the
   * call that saves them (the same "save & approve" as the button here).
   */
  onDraftChange?: (save: (() => Promise<boolean>) | null) => void;
}

/** One roster entry, editable in place: a reference-photo slot (upload/remove) beside its appearance text. */
function RosterEntryRow({
  entry,
  uploading,
  onAppearanceChange,
  onImageChange,
  onUpload,
  attachImageLabel,
}: {
  entry: RosterEntry;
  uploading: boolean;
  onAppearanceChange: (appearance: string) => void;
  onImageChange: (fileId: string | undefined) => void;
  onUpload: (file: File) => void;
  attachImageLabel: string;
}) {
  return (
    <div className="flex gap-3">
      {entry.appearanceImageFileId ? (
        <div className="relative size-16 shrink-0">
          <img
            src={apiClient.documents.fileUrl(entry.appearanceImageFileId)}
            alt=""
            className="size-16 rounded-lg border border-gray-200 object-cover dark:border-gray-800"
          />
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            className="absolute -end-1.5 -top-1.5 rounded-full bg-white dark:bg-gray-900"
            onClick={() => onImageChange(undefined)}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : (
        <label className="flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-500">
          {uploading ? (
            <Spinner />
          ) : (
            <>
              <UploadIcon className="size-4" />
              <span className="text-[10px]">{attachImageLabel}</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
      )}
      <Field className="flex-1">
        <FieldLabel>{entry.name}</FieldLabel>
        <Textarea
          value={entry.appearance}
          onChange={(e) => onAppearanceChange(e.target.value)}
        />
      </Field>
    </div>
  );
}

/**
 * Scenes of the analysis, editable in place. "Save & approve" stores the edits
 * as a new approved version — approved versions are what skills learn from.
 */
export default function SceneEditor({
  scenes,
  characterRoster,
  objectRoster,
  approved,
  approving,
  canApprove,
  onApprove,
  onDraftChange,
}: SceneEditorProps) {
  const t = useTranslations("videoStudio.script");
  const [draft, setDraft] = useState<ScriptScene[] | null>(null);
  const [characterRosterDraft, setCharacterRosterDraft] = useState<
    RecurringCharacter[] | null
  >(null);
  const [objectRosterDraft, setObjectRosterDraft] = useState<
    RecurringObject[] | null
  >(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(
    null,
  );

  function rosterHelpers<T extends RosterEntry>(
    setRoster: Dispatch<SetStateAction<T[] | null>>,
  ) {
    const updateAppearance = (name: string, appearance: string) =>
      setRoster(
        (prev) =>
          prev?.map((entry) =>
            entry.name === name ? { ...entry, appearance } : entry,
          ) ?? null,
      );
    const updateImage = (name: string, appearanceImageFileId?: string) =>
      setRoster(
        (prev) =>
          prev?.map((entry) =>
            entry.name === name ? { ...entry, appearanceImageFileId } : entry,
          ) ?? null,
      );
    const upload = async (name: string, file: File) => {
      setUploadingImageFor(name);
      try {
        const { fileId } = await apiClient.script.uploadRosterImage(file);
        updateImage(name, fileId);
      } catch {
        // The field just stays as it was; the user can retry.
      } finally {
        setUploadingImageFor((prev) => (prev === name ? null : prev));
      }
    };
    return { updateAppearance, updateImage, upload };
  }

  const characterHelpers = rosterHelpers(setCharacterRosterDraft);
  const objectHelpers = rosterHelpers(setObjectRosterDraft);

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
    if (
      await onApprove(
        edited,
        characterRosterDraft ?? characterRoster,
        objectRosterDraft ?? objectRoster,
      )
    ) {
      setDraft(null);
      setCharacterRosterDraft(null);
      setObjectRosterDraft(null);
      return true;
    }
    return false;
  };

  // Hand the latest save-the-draft call to the studio's Save button while editing.
  const approveRef = useRef(handleApprove);
  useEffect(() => {
    approveRef.current = handleApprove;
  });
  const editing = draft !== null;
  useEffect(() => {
    onDraftChange?.(editing ? () => approveRef.current() : null);
  }, [editing, onDraftChange]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setCharacterRosterDraft(null);
                  setObjectRosterDraft(null);
                }}
              >
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
                onClick={() => {
                  setDraft(scenes);
                  setCharacterRosterDraft(characterRoster);
                  setObjectRosterDraft(objectRoster);
                }}
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
          {characterRosterDraft && characterRosterDraft.length > 0 && (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {t("characterRosterSection")}
                </span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("characterRosterHint")}
                </p>
              </div>
              {characterRosterDraft.map((character) => (
                <RosterEntryRow
                  key={character.name}
                  entry={character}
                  uploading={uploadingImageFor === character.name}
                  attachImageLabel={t("approve.attachImage")}
                  onAppearanceChange={(appearance) =>
                    characterHelpers.updateAppearance(character.name, appearance)
                  }
                  onImageChange={(fileId) =>
                    characterHelpers.updateImage(character.name, fileId)
                  }
                  onUpload={(file) => void characterHelpers.upload(character.name, file)}
                />
              ))}
            </div>
          )}
          {objectRosterDraft && objectRosterDraft.length > 0 && (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {t("objectRosterSection")}
                </span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("objectRosterHint")}
                </p>
              </div>
              {objectRosterDraft.map((object) => (
                <RosterEntryRow
                  key={object.name}
                  entry={object}
                  uploading={uploadingImageFor === object.name}
                  attachImageLabel={t("approve.attachImage")}
                  onAppearanceChange={(appearance) =>
                    objectHelpers.updateAppearance(object.name, appearance)
                  }
                  onImageChange={(fileId) => objectHelpers.updateImage(object.name, fileId)}
                  onUpload={(file) => void objectHelpers.upload(object.name, file)}
                />
              ))}
            </div>
          )}
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
        <ScenesList
          scenes={scenes}
          characterRoster={characterRoster}
          objectRoster={objectRoster}
        />
      )}
    </div>
  );
}
