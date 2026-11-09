import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/i18n";
import {
  BoltIcon,
  CheckIcon,
  DownloadIcon,
  GptIcon,
  PaperClipIcon,
  PencilIcon,
  SearchIcon,
  SparkIcon,
  TrashBinIcon,
  UploadIcon,
  XIcon,
} from "@/icons";
import { apiClient } from "@/lib/api-client";
import CandidatePreview from "@/pages/main/video-studio/steps/assets/candidate-preview";
import { cn } from "@/utils";
import type {
  AssetCandidate,
  ImageAspectRatio,
  LibraryAsset,
  LibraryMediaType,
  ResearchSourceInfo,
} from "@shared/types";
import { useEffect, useRef, useState } from "react";

const TYPE_FILTERS = ["all", "image", "video", "audio"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được file."));
    reader.readAsDataURL(file);
  });
}

const ASPECT_CLASS: Record<ImageAspectRatio, string> = {
  square: "aspect-square",
  portrait: "aspect-[9/16]",
  landscape: "aspect-video",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The internal asset library: the user's own images, clips and audio, searchable from the Assets step. */
export default function AssetLibraryPage() {
  const t = useTranslations("videoStudio.library");
  const tNav = useTranslations("sidebar.items");

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [uploadTags, setUploadTags] = useState("");
  const [editing, setEditing] = useState<LibraryAsset | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = (q: string, type: TypeFilter) =>
    apiClient.assets.library
      .list({ q: q.trim() || undefined, type: type === "all" ? undefined : (type as LibraryMediaType) })
      .then(setAssets)
      .catch((err) => setErrors([errorMessage(err)]))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load("", "all");
  }, []);

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    setErrors([]);
    const failures: string[] = [];
    for (const file of files) {
      try {
        await apiClient.assets.library.upload(file, { tags: uploadTags });
      } catch (err) {
        failures.push(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setErrors(failures);
    await load(query, typeFilter);
    setUploading(false);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageMeta title={tNav("videoStudioAssets")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <p className="mb-4 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{t("pageDescription")}</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          className="flex min-w-60 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(query, typeFilter);
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
          <Button type="submit" variant="outline" size="icon" title={t("searchButton")}>
            <SearchIcon className="size-4" />
          </Button>
        </form>
        <ToggleGroup
          variant="outline"
          value={[typeFilter]}
          onValueChange={(value) => {
            const next = (value[0] as TypeFilter | undefined) ?? "all";
            setTypeFilter(next);
            void load(query, next);
          }}
        >
          {TYPE_FILTERS.map((type) => (
            <ToggleGroupItem key={type} value={type}>
              {t(`types.${type}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Input
          value={uploadTags}
          onChange={(e) => setUploadTags(e.target.value)}
          placeholder={t("uploadTagsPlaceholder")}
          className="w-56"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void handleUpload(files);
          }}
        />
        <Button type="button" className="gap-1.5" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Spinner /> : <UploadIcon className="size-4" />}
          {t("uploadButton")}
        </Button>
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => setGenerating(true)}>
          <SparkIcon className="size-4" />
          {t("generateButton")}
        </Button>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="glass-flat flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <CandidatePreview
                candidate={{
                  mediaType: asset.mediaType,
                  url: apiClient.documents.fileUrl(asset.fileId),
                  title: asset.name,
                }}
                className="aspect-video w-full"
              />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-white/90" title={asset.name}>
                    {asset.name}
                  </span>
                  <Badge variant="light" color="gray" size="sm">
                    {t(`types.${asset.mediaType}`)}
                  </Badge>
                </div>
                {asset.description && (
                  <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{asset.description}</p>
                )}
                {asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.map((tag) => (
                      <Badge key={tag} variant="light" color="primary" size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-1 pt-1">
                  <span className="me-auto text-[11px] text-gray-400 dark:text-gray-500">{formatSize(asset.size)}</span>
                  <Button type="button" variant="ghost" size="icon-xs" title={t("editButton")} onClick={() => setEditing(asset)}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" title={t("deleteButton")} onClick={() => setDeleteTarget(asset)}>
                    <TrashBinIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {generating && (
        <GenerateImageDialog
          onClose={() => setGenerating(false)}
          onSaved={() => void load(query, typeFilter)}
        />
      )}

      {editing && (
        <EditAssetDialog
          key={editing.id}
          asset={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            void run(async () => {
              const updated = await apiClient.assets.library.update(editing.id, patch);
              setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
              setEditing(null);
            })
          }
        />
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription", { name: deleteTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!deleteTarget) return;
                  await apiClient.assets.library.delete(deleteTarget.id);
                  setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
                  setDeleteTarget(null);
                })
              }
            >
              {busy && <Spinner />}
              {t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pick an AI image source, describe a prompt, generate a few variations and save the ones worth keeping. */
function GenerateImageDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("videoStudio.library");
  const [sources, setSources] = useState<ResearchSourceInfo[] | null>(null);
  const [sourceKey, setSourceKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("square");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AssetCandidate[]>([]);
  /** The ratio actually used for `candidates` — captured at request time so a mid-flight toggle change can't mismatch it. */
  const [resultAspectRatio, setResultAspectRatio] = useState<ImageAspectRatio>("square");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<AssetCandidate | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient.assets
      .sources()
      .then((list) => {
        const imageSources = list.filter((s) => s.kind === "ai" && s.mediaTypes.includes("image"));
        setSources(imageSources);
        setSourceKey(imageSources.find((s) => s.available)?.key ?? imageSources[0]?.key ?? "");
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setSources([]);
      });
  }, []);

  const source = sources?.find((s) => s.key === sourceKey);

  const generate = async () => {
    if (!source || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCandidates([]);
    setResultAspectRatio(aspectRatio);
    try {
      const result = await apiClient.assets.research({
        sourceKey: source.key,
        query: prompt.trim(),
        referenceImage: referenceImage ?? undefined,
        aspectRatio,
      });
      setCandidates(result.candidates);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const save = async (candidate: AssetCandidate) => {
    setSavingId(candidate.externalId);
    try {
      await apiClient.assets.library.fromCandidate(candidate, {
        name: prompt.trim().slice(0, 80),
        description: prompt.trim(),
      });
      setSavedIds((prev) => new Set(prev).add(candidate.externalId));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("generateTitle")}</DialogTitle>
          <DialogDescription>{t("generateDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {sources === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : sources.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>{t("generateNoSource")}</AlertDescription>
          </Alert>
        ) : (
          <>
            {sources.length > 1 && (
              <Field className="w-auto">
                <FieldLabel>{t("generateSourceLabel")}</FieldLabel>
                <Tabs value={sourceKey} onValueChange={(value) => setSourceKey(value as string)}>
                  <TabsList>
                    {sources.map((s) => (
                      <TabsTrigger key={s.key} value={s.key} className="gap-1.5" disabled={!s.available}>
                        {s.key === "cloudflare-image" ? (
                          <BoltIcon className="size-4" />
                        ) : s.key === "openai-image" ? (
                          <GptIcon className="size-4" />
                        ) : (
                          <SparkIcon className="size-4" />
                        )}
                        {s.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </Field>
            )}

            {source && !source.available ? (
              <Alert variant="warning">
                <AlertDescription>
                  {t("generateNoSourceAvailable", { source: source.label })}
                </AlertDescription>
              </Alert>
            ) : (
              <form
                className="rounded-2xl border border-gray-200 bg-gray-50 p-2 focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/20 dark:border-gray-800 dark:bg-white/[0.03] dark:focus-within:border-brand-500/40"
                onSubmit={(e) => {
                  e.preventDefault();
                  void generate();
                }}
              >
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readAsDataUrl(file).then(setReferenceImage);
                  }}
                />
                {referenceImage && (
                  <div className="mb-2 flex items-center gap-2">
                    <div className="relative">
                      <img src={referenceImage} alt="" className="size-12 rounded-lg object-cover" />
                      <button
                        type="button"
                        className="absolute -top-1.5 -end-1.5 flex size-4.5 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-800"
                        onClick={() => setReferenceImage(null)}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t("generateReferenceSet")}</span>
                  </div>
                )}

                <Textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t("generatePromptPlaceholder")}
                  className="resize-none rounded-lg border-0 bg-transparent px-2 shadow-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent"
                />

                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                      title={t("generateReferenceHint")}
                      onClick={() => referenceInputRef.current?.click()}
                    >
                      <PaperClipIcon className="size-4" />
                    </Button>
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      value={[aspectRatio]}
                      onValueChange={(value) => {
                        const next = value[0] as ImageAspectRatio | undefined;
                        if (next) setAspectRatio(next);
                      }}
                    >
                      <ToggleGroupItem value="square" title={t("aspectSquare")} className="px-2.5 font-jetbrains-mono text-xs">
                        1:1
                      </ToggleGroupItem>
                      <ToggleGroupItem value="portrait" title={t("aspectPortrait")} className="px-2.5 font-jetbrains-mono text-xs">
                        9:16
                      </ToggleGroupItem>
                      <ToggleGroupItem value="landscape" title={t("aspectLandscape")} className="px-2.5 font-jetbrains-mono text-xs">
                        16:9
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="gap-1.5 rounded-full"
                    disabled={loading || !prompt.trim()}
                  >
                    {loading ? <Spinner /> : <SparkIcon className="size-4" />}
                    {t("generateSubmit")}
                  </Button>
                </div>
              </form>
            )}

            {loading && (
              <div
                className={cn(
                  "animate-shimmer mx-auto w-full max-w-sm rounded-xl bg-[length:200%_100%] bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900",
                  ASPECT_CLASS[resultAspectRatio],
                )}
                aria-hidden
              >
                <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
                  <SparkIcon className="size-6 animate-pulse" />
                  <span className="text-xs">{t("generating")}</span>
                </div>
              </div>
            )}

            {!loading && candidates.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {candidates.map((candidate, i) => {
                  const saved = savedIds.has(candidate.externalId);
                  return (
                    <div
                      key={candidate.externalId}
                      className="animate-in fade-in zoom-in-95 group relative overflow-hidden rounded-xl border border-gray-200 duration-300 dark:border-gray-800"
                      style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
                    >
                      <button
                        type="button"
                        className="block w-full cursor-zoom-in"
                        onClick={() => setPreviewCandidate(candidate)}
                      >
                        <CandidatePreview
                          candidate={candidate}
                          className={cn(
                            "w-full transition-transform duration-200 group-hover:scale-105",
                            ASPECT_CLASS[resultAspectRatio],
                          )}
                        />
                      </button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant={saved ? "default" : "outline"}
                        className={cn(
                          "absolute end-2 top-2 rounded-full shadow-theme-sm",
                          !saved && "bg-white/90 backdrop-blur-sm dark:bg-gray-900/80",
                        )}
                        title={t(saved ? "savedToLibrary" : "saveToLibrary")}
                        disabled={savingId !== null || saved}
                        onClick={() => void save(candidate)}
                      >
                        {savingId === candidate.externalId ? (
                          <Spinner />
                        ) : saved ? (
                          <CheckIcon className="size-4" />
                        ) : (
                          <DownloadIcon className="size-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={previewCandidate !== null} onOpenChange={(open) => !open && setPreviewCandidate(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 pe-6">{previewCandidate?.title}</DialogTitle>
          </DialogHeader>
          {previewCandidate && (
            <img
              src={previewCandidate.url}
              alt=""
              className="max-h-[70vh] w-full rounded-xl border border-gray-200 object-contain dark:border-gray-800"
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewCandidate(null)}>
              {t("cancel")}
            </Button>
            {previewCandidate &&
              (() => {
                const saved = savedIds.has(previewCandidate.externalId);
                return (
                  <Button
                    type="button"
                    className="gap-1.5"
                    disabled={savingId !== null || saved}
                    onClick={() => void save(previewCandidate)}
                  >
                    {savingId === previewCandidate.externalId ? (
                      <Spinner />
                    ) : saved ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <DownloadIcon className="size-4" />
                    )}
                    {t(saved ? "savedToLibrary" : "saveToLibrary")}
                  </Button>
                );
              })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function EditAssetDialog({
  asset,
  busy,
  onClose,
  onSave,
}: {
  asset: LibraryAsset;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; tags: string[]; description: string }) => void;
}) {
  const t = useTranslations("videoStudio.library");
  const [name, setName] = useState(asset.name);
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [description, setDescription] = useState(asset.description);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t("nameLabel")}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{t("tagsLabel")}</FieldLabel>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("uploadTagsPlaceholder")} />
        </Field>
        <Field>
          <FieldLabel>{t("descriptionLabel")}</FieldLabel>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                description: description.trim(),
              })
            }
          >
            {busy && <Spinner />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
