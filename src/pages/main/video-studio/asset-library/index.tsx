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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/i18n";
import { PencilIcon, SearchIcon, TrashBinIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import CandidatePreview from "@/pages/main/video-studio/steps/assets/candidate-preview";
import type { LibraryAsset, LibraryMediaType } from "@shared/types";
import { useEffect, useRef, useState } from "react";

const TYPE_FILTERS = ["all", "image", "video", "audio"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
