import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { SkeletonMediaGrid } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  CameraIcon,
  CheckIcon,
  DownloadIcon,
  GptIcon,
  LayoutGridIcon,
  MusicIcon,
  PaperClipIcon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  SparkIcon,
  TrashBinIcon,
  UploadIcon,
  XIcon,
} from "@/icons";
import { apiClient } from "@/lib/api-client";
import { MediaPreviewDialog, MediaTile } from "@/pages/main/library/media/media-tile";
import { formatSize, UploadDialog } from "@/pages/main/library/media/upload-dialog";
import { CategoryChips } from "@/pages/main/library/sound-effects/category-chips";
import { systemCategoryOf } from "@/pages/main/library/sound-effects/category-style";
import { NowPlayingBar } from "@/pages/main/library/sound-effects/now-playing-bar";
import { PagedList } from "@/pages/main/library/sound-effects/paged-list";
import {
  PreviewPlayer,
  PreviewPlayerContext,
  type PreviewTrack,
} from "@/pages/main/library/sound-effects/preview-player";
import { RowActionButton, SoundRow } from "@/pages/main/library/sound-effects/sound-row";
import CandidatePreview from "@/pages/main/studio/steps/assets/candidate-preview";
import { cn } from "@/utils";
import type {
  AssetCandidate,
  ImageAspectRatio,
  LibraryAsset,
  LibraryMediaType,
  ResearchSourceInfo,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const TYPE_FILTERS = ["all", "image", "video", "audio"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
const TYPE_ICONS = { all: LayoutGridIcon, image: CameraIcon, video: PlayIcon, audio: MusicIcon };

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

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      <span className="text-xs text-gray-400 dark:text-gray-500">{count}</span>
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
      <span className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500">
        <LayoutGridIcon className="size-5" />
      </span>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      {children}
    </div>
  );
}

/**
 * The internal asset library: the user's own images, clips and audio,
 * searchable from the Assets step. Images/videos show as a thumbnail grid,
 * audio as preview rows sharing one player (same as the sound-effects page).
 */
export default function AssetLibraryPage() {
  const t = useTranslations("videoStudio.library");
  const tNav = useTranslations("sidebar.items");

  const [player] = useState(() => new PreviewPlayer());
  useEffect(() => () => player.dispose(), [player]);

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryAsset | null>(null);
  const [previewing, setPreviewing] = useState<LibraryAsset | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Search as you type (debounced); the server matches name, tags and description.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      apiClient.assets.library
        .list({ q: query.trim() || undefined, type: typeFilter === "all" ? undefined : (typeFilter as LibraryMediaType) })
        .then((list) => {
          if (!cancelled) setAssets(list);
        })
        .catch((err) => {
          if (!cancelled) setErrors([errorMessage(err)]);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, typeFilter, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const visual = useMemo(() => assets.filter((a) => a.mediaType !== "audio"), [assets]);
  const audio = useMemo(() => assets.filter((a) => a.mediaType === "audio"), [assets]);
  const audioQueue = useMemo(
    () =>
      audio.map(
        (asset): PreviewTrack => ({
          id: `asset:${asset.id}`,
          src: apiClient.documents.fileUrl(asset.fileId),
          title: asset.name,
          subtitle: [asset.category ?? asset.tags.join(" · "), formatSize(asset.size)].filter(Boolean).join(" · "),
          categoryId: systemCategoryOf(asset.sourcePackId),
        }),
      ),
    [audio],
  );

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

  const showHeadings = typeFilter === "all" && visual.length > 0 && audio.length > 0;

  return (
    <PreviewPlayerContext.Provider value={player}>
      <PageMeta title={tNav("mediaLibrary")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("pageDescription")}</p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1 sm:max-w-2xl">
            <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-12 rounded-full border-transparent bg-gray-100 ps-12 pe-11 shadow-none [&::-webkit-search-cancel-button]:hidden dark:border-transparent dark:bg-white/[0.06]"
            />
            <span className="absolute end-3 top-1/2 flex -translate-y-1/2 items-center">
              {searching ? (
                <Spinner />
              ) : (
                query && (
                  <button
                    type="button"
                    aria-label={t("clearSearch")}
                    onClick={() => setQuery("")}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    <XIcon className="size-4" />
                  </button>
                )
              )}
            </span>
          </div>
          <div className="ms-auto flex gap-2">
            <Button type="button" variant="outline" className="h-11 gap-1.5 rounded-full" onClick={() => setGenerating(true)}>
              <SparkIcon className="size-4" />
              {t("generateButton")}
            </Button>
            <Button type="button" className="h-11 gap-1.5 rounded-full" onClick={() => setUploadOpen(true)}>
              <UploadIcon className="size-4" />
              {t("uploadButton")}
            </Button>
          </div>
        </div>

        <div className="mb-5">
          <CategoryChips
            value={typeFilter}
            onChange={(value) => {
              player.stop();
              setTypeFilter(value as TypeFilter);
            }}
            items={TYPE_FILTERS.map((type) => ({ value: type, label: t(`types.${type}`), Icon: TYPE_ICONS[type] }))}
          />
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
          <SkeletonMediaGrid count={8} />
        ) : assets.length === 0 ? (
          query.trim() ? (
            <EmptyState title={t("noResults")} />
          ) : (
            <EmptyState title={t("empty")}>
              <Button type="button" className="gap-1.5 rounded-full" onClick={() => setUploadOpen(true)}>
                <UploadIcon className="size-4" />
                {t("uploadButton")}
              </Button>
            </EmptyState>
          )
        ) : (
          <div className="flex flex-col gap-8">
            {visual.length > 0 && (
              <section>
                {showHeadings && <SectionHeading title={t("sections.visual")} count={visual.length} />}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {visual.map((asset) => (
                    <MediaTile
                      key={asset.id}
                      asset={asset}
                      onOpen={() => setPreviewing(asset)}
                      onEdit={() => setEditing(asset)}
                      onDelete={() => setDeleteTarget(asset)}
                    />
                  ))}
                </div>
              </section>
            )}
            {audio.length > 0 && (
              <section>
                {showHeadings && <SectionHeading title={t("sections.audio")} count={audio.length} />}
                <PagedList
                  key={`${typeFilter}|${query}`}
                  items={audio.map((asset, index) => ({ asset, track: audioQueue[index] }))}
                  render={({ asset, track }) => (
                    <SoundRow
                      key={asset.id}
                      track={track}
                      queue={audioQueue}
                      action={
                        <>
                          <RowActionButton label={t("editButton")} onClick={() => setEditing(asset)}>
                            <PencilIcon className="size-4" />
                          </RowActionButton>
                          <RowActionButton label={t("deleteButton")} onClick={() => setDeleteTarget(asset)}>
                            <TrashBinIcon className="size-4" />
                          </RowActionButton>
                        </>
                      }
                    />
                  )}
                />
              </section>
            )}
          </div>
        )}
      </div>

      <NowPlayingBar />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={reload} />

      <MediaPreviewDialog
        asset={previewing}
        onClose={() => setPreviewing(null)}
        onEdit={(asset) => {
          setPreviewing(null);
          setEditing(asset);
        }}
        onDelete={(asset) => {
          setPreviewing(null);
          setDeleteTarget(asset);
        }}
      />

      {generating && <GenerateImageDialog onClose={() => setGenerating(false)} onSaved={reload} />}

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
                  if (player.getCurrent()?.id === `asset:${deleteTarget.id}`) player.stop();
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
    </PreviewPlayerContext.Provider>
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
        referenceImages: referenceImage ? [referenceImage] : undefined,
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
