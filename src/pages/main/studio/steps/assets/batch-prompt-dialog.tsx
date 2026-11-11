import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { CheckIcon, CopyIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type {
  AssetCandidate,
  RecurringCharacter,
  RecurringObject,
  ScriptScene,
} from "@shared/types";
import JSZip from "jszip";
import { useMemo, useRef, useState } from "react";
import { blobToDataUrl, sceneContextOf } from "./scene-context";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface PromptGroup {
  key: string;
  description: string;
  category: "character" | "background";
  sceneContext: string;
  slots: { sceneIndex: number; assetIndex: number }[];
  /** Roster characters/objects this request's description names — their reference photos (if any) ground the generated prompt. */
  entries: (RecurringCharacter | RecurringObject)[];
  prompt?: string;
}

/** Deduped prompt groups: identical-wording required assets across scenes collapse into one. */
function groupRequiredAssets(
  scenes: ScriptScene[],
  characterRoster: RecurringCharacter[],
  objectRoster: RecurringObject[],
): PromptGroup[] {
  const byNormalized = new Map<string, PromptGroup>();
  let counter = 0;
  for (const scene of scenes) {
    scene.requiredAssets.forEach((asset, assetIndex) => {
      if (asset.type !== "image" && asset.type !== "graphic") return;
      const normalized = asset.description.trim().toLowerCase();
      if (!normalized) return;
      const existing = byNormalized.get(normalized);
      if (existing) {
        existing.slots.push({ sceneIndex: scene.index, assetIndex });
        return;
      }
      const entries = [
        ...characterRoster.filter((c) => normalized.includes(c.name.toLowerCase())),
        ...objectRoster.filter((o) => normalized.includes(o.name.toLowerCase())),
      ];
      counter += 1;
      byNormalized.set(normalized, {
        key: `p${counter}`,
        description: asset.description,
        category: entries.length > 0 ? "character" : "background",
        sceneContext: sceneContextOf(scene, characterRoster, objectRoster),
        slots: [{ sceneIndex: scene.index, assetIndex }],
        entries,
      });
    });
  }
  return [...byNormalized.values()];
}

function libraryCandidateOf(asset: Awaited<ReturnType<typeof apiClient.assets.library.upload>>): AssetCandidate {
  const fileUrl = apiClient.documents.fileUrl(asset.fileId);
  return {
    sourceKey: "library",
    externalId: asset.id,
    mediaType: asset.mediaType,
    title: asset.name,
    previewUrl: asset.mediaType === "image" ? fileUrl : undefined,
    url: fileUrl,
    description: [asset.description, asset.tags.length ? `#${asset.tags.join(" #")}` : ""]
      .filter(Boolean)
      .join(" "),
  };
}

const MASTER_PROMPT_VI =
  "Bạn sẽ nhận một danh sách yêu cầu tạo ảnh bên dưới, mỗi yêu cầu có một MÃ riêng (vd. p1, p2...). " +
  "Phong cách đồ hoạ đã có sẵn trong skill đính kèm ở cuộc trò chuyện này — không cần mô tả lại phong cách, chỉ áp dụng đúng theo skill. " +
  "Với mỗi yêu cầu, tạo đúng MỘT ảnh. Sau khi tạo xong TẤT CẢ yêu cầu, đóng gói toàn bộ ảnh thành MỘT file zip duy nhất — " +
  "mỗi ảnh đặt tên CHÍNH XÁC bằng MÃ tương ứng (ví dụ: p1.png, p2.png), rồi gửi file zip đó cho tôi.";

interface BatchPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  scenes: ScriptScene[];
  characterRoster: RecurringCharacter[];
  objectRoster: RecurringObject[];
  onImported: () => void;
}

export default function BatchPromptDialog({
  open,
  onOpenChange,
  videoId,
  scenes,
  characterRoster,
  objectRoster,
  onImported,
}: BatchPromptDialogProps) {
  const t = useTranslations("videoStudio.assets.batchPrompt");
  const tAssets = useTranslations("videoStudio.assets");

  const sceneIndices = scenes.map((s) => s.index);
  const minScene = sceneIndices.length ? Math.min(...sceneIndices) : 1;
  const maxScene = sceneIndices.length ? Math.max(...sceneIndices) : 1;

  // Kịch bản dài (hàng trăm cảnh) sẽ ra quá nhiều prompt để tạo/dán cùng lúc —
  // người dùng chọn một khoảng cảnh nhỏ hơn mỗi lần xuất.
  const [fromScene, setFromScene] = useState(minScene);
  const [toScene, setToScene] = useState(maxScene);
  const scenesInRange = () => scenes.filter((s) => s.index >= fromScene && s.index <= toScene);

  const [groups, setGroups] = useState<PromptGroup[]>(() =>
    groupRequiredAssets(scenesInRange(), characterRoster, objectRoster),
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: string[]; skipped: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const regroup = () =>
    setGroups(groupRequiredAssets(scenesInRange(), characterRoster, objectRoster));

  const characterGroups = useMemo(() => groups.filter((g) => g.category === "character"), [groups]);
  const backgroundGroups = useMemo(() => groups.filter((g) => g.category === "background"), [groups]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const characterImageCache = useRef(new Map<string, string>());
  const characterImagesFor = async (
    entries: (RecurringCharacter | RecurringObject)[],
  ): Promise<{ name: string; image: string }[]> => {
    const withPhoto = entries.filter(
      (c): c is (RecurringCharacter | RecurringObject) & { appearanceImageFileId: string } =>
        Boolean(c.appearanceImageFileId),
    );
    const images = await Promise.all(
      withPhoto.map(async (c) => {
        const fileId = c.appearanceImageFileId;
        const cached = characterImageCache.current.get(fileId);
        if (cached) return cached;
        const dataUrl = await fetch(apiClient.documents.fileUrl(fileId))
          .then((res) => res.blob())
          .then(blobToDataUrl);
        characterImageCache.current.set(fileId, dataUrl);
        return dataUrl;
      }),
    );
    return withPhoto.map((c, i) => ({ name: c.name, image: images[i]! }));
  };

  const generateAll = async () => {
    const pending = groups.filter((g) => !g.prompt);
    if (pending.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const items = await Promise.all(
        pending.map(async (g) => ({
          key: g.key,
          description: g.description,
          sceneContext: g.sceneContext,
          characterImages: await characterImagesFor(g.entries),
        })),
      );
      const { results } = await apiClient.assets.imagePrompts({
        provider: "claude",
        items,
      });
      const byKey = new Map(results.map((r) => [r.key, r.prompt]));
      setGroups((prev) => prev.map((g) => (byKey.has(g.key) ? { ...g, prompt: byKey.get(g.key) } : g)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const sceneLabel = (group: PromptGroup) =>
    group.slots.map((s) => tAssets("scene", { index: s.sceneIndex })).join(", ");

  const fullBatchText = () => {
    const lines = [MASTER_PROMPT_VI, ""];
    for (const group of [...characterGroups, ...backgroundGroups]) {
      lines.push(
        `[${group.key}] (${sceneLabel(group)})`,
        `${t("descriptionLabel")}: ${group.description}`,
        `${t("promptLabel")}: ${group.prompt ?? t("notGeneratedYet")}`,
        "",
      );
    }
    return lines.join("\n").trim();
  };

  const handleImportZip = async (file: File) => {
    setImporting(true);
    setError(null);
    setImportResult(null);
    const matched: string[] = [];
    const skipped: string[] = [];
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir);
      for (const entry of entries) {
        const base = entry.name.split("/").pop() ?? entry.name;
        const key = base.replace(/\.[^.]+$/, "").trim().toLowerCase();
        const group = groups.find((g) => g.key === key);
        if (!group) {
          skipped.push(base);
          continue;
        }
        const blob = await entry.async("blob");
        const imageFile = new File([blob], base, { type: blob.type || "image/png" });
        const asset = await apiClient.assets.library.upload(imageFile, {
          name: group.description.slice(0, 80),
          tags: "batch-import",
        });
        const candidate = libraryCandidateOf(asset);
        for (const slot of group.slots) {
          await apiClient.assets.select({
            videoId,
            sceneIndex: slot.sceneIndex,
            assetIndex: slot.assetIndex,
            assetDescription: group.description,
            candidate,
          });
        }
        matched.push(base);
      }
      setImportResult({ matched, skipped });
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const renderGroup = (group: PromptGroup) => (
    <div key={group.key} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="light" color="primary" size="sm">
          {group.key}
        </Badge>
        <span className="text-xs text-gray-500 dark:text-gray-400">{sceneLabel(group)}</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="ms-auto"
          title={t("copyItem")}
          onClick={() => void copy(group.key, `${group.description}\n${group.prompt ?? ""}`)}
        >
          {copiedKey === group.key ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
      </div>
      <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">{group.description}</p>
      {group.prompt ? (
        <p className="mt-1.5 rounded-lg bg-gray-50 p-2 font-mono text-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
          {group.prompt}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{t("notGeneratedYet")}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader className="pe-10">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("rangeHint")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">{t("rangeFrom")}</span>
              <Input
                type="number"
                min={minScene}
                max={maxScene}
                value={fromScene}
                onChange={(e) =>
                  setFromScene(Math.min(Math.max(Number(e.target.value) || minScene, minScene), maxScene))
                }
                className="w-24"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t("rangeTo")}</span>
              <Input
                type="number"
                min={minScene}
                max={maxScene}
                value={toScene}
                onChange={(e) =>
                  setToScene(Math.min(Math.max(Number(e.target.value) || maxScene, minScene), maxScene))
                }
                className="w-24"
              />
              <Button type="button" size="sm" onClick={regroup}>
                {t("applyRange")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setFromScene(minScene);
                  setToScene(maxScene);
                  setGroups(groupRequiredAssets(scenes, characterRoster, objectRoster));
                }}
              >
                {t("rangeAll")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {t("rangeSummary", { scenes: scenesInRange().length, groups: groups.length })}
            </p>
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-xs text-gray-700 dark:border-brand-500/20 dark:bg-brand-500/5 dark:text-gray-300">
            <p className="whitespace-pre-wrap">{MASTER_PROMPT_VI}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" className="gap-1.5" disabled={generating} onClick={() => void generateAll()}>
              {generating ? <Spinner /> : null}
              {t("generateAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void copy("__all__", fullBatchText())}
            >
              {copiedKey === "__all__" ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              {t("copyAll")}
            </Button>
          </div>

          {characterGroups.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("characterGroup")}</h3>
              <div className="space-y-2">{characterGroups.map(renderGroup)}</div>
            </section>
          )}

          {backgroundGroups.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("backgroundGroup")}</h3>
              <div className="space-y-2">{backgroundGroups.map(renderGroup)}</div>
            </section>
          )}

          {groups.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
          )}

          <section className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("importTitle")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("importHint")}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImportZip(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? <Spinner /> : <UploadIcon className="size-4" />}
              {t("importButton")}
            </Button>
            {importResult && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("importDone", { matched: importResult.matched.length, skipped: importResult.skipped.length })}
                {importResult.skipped.length > 0 && ` (${importResult.skipped.join(", ")})`}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
