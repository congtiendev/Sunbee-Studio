import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "@/i18n";
import { PencilIcon, PlayIcon, TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { formatSize } from "@/pages/main/library/media/upload-dialog";
import CandidatePreview from "@/pages/main/studio/steps/assets/candidate-preview";
import type { LibraryAsset } from "@shared/types";
import type { ReactNode } from "react";

function TileAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-theme-xs backdrop-blur-sm transition-colors hover:bg-white hover:text-gray-900 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900"
    >
      {children}
    </button>
  );
}

/** One image/video in the media grid: square thumbnail, name over a gradient, edit/delete on hover. */
export function MediaTile({
  asset,
  onOpen,
  onEdit,
  onDelete,
}: {
  asset: LibraryAsset;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("videoStudio.library");
  const meta = asset.tags.length > 0 ? asset.tags.join(" · ") : formatSize(asset.size);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
      <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in" aria-label={`${t("open")}: ${asset.name}`}>
        <CandidatePreview
          candidate={{ mediaType: asset.mediaType, url: apiClient.documents.fileUrl(asset.fileId), title: asset.name }}
          className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </button>
      {asset.mediaType === "video" && (
        <span className="pointer-events-none absolute start-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <PlayIcon className="size-3.5 ms-px" />
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/35 to-transparent px-3 pt-10 pb-2.5">
        <p className="truncate text-sm font-medium text-white" title={asset.name}>
          {asset.name}
        </p>
        <p className="truncate text-[11px] text-white/70">{meta}</p>
      </div>
      <div className="absolute end-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <TileAction label={t("editButton")} onClick={onEdit}>
          <PencilIcon className="size-4" />
        </TileAction>
        <TileAction label={t("deleteButton")} onClick={onDelete}>
          <TrashBinIcon className="size-4" />
        </TileAction>
      </div>
    </div>
  );
}

/** Large view of one image/video with its details. */
export function MediaPreviewDialog({
  asset,
  onClose,
  onEdit,
  onDelete,
}: {
  asset: LibraryAsset | null;
  onClose: () => void;
  onEdit: (asset: LibraryAsset) => void;
  onDelete: (asset: LibraryAsset) => void;
}) {
  const t = useTranslations("videoStudio.library");
  const url = asset ? apiClient.documents.fileUrl(asset.fileId) : "";

  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        {asset && (
          <>
            <DialogHeader>
              <DialogTitle className="line-clamp-2 pe-6">{asset.name}</DialogTitle>
              {asset.description && <DialogDescription>{asset.description}</DialogDescription>}
            </DialogHeader>
            <div className="flex justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900">
              {asset.mediaType === "video" ? (
                <video src={url} controls autoPlay className="max-h-[65vh] w-full" />
              ) : (
                <img src={url} alt={asset.name} className="max-h-[65vh] w-full object-contain" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {asset.tags.map((tag) => (
                <Badge key={tag} variant="light" color="primary" size="sm">
                  {tag}
                </Badge>
              ))}
              <span className="text-xs text-gray-400 dark:text-gray-500">{formatSize(asset.size)}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => onDelete(asset)}>
                <TrashBinIcon className="size-4" />
                {t("deleteButton")}
              </Button>
              <Button type="button" className="gap-1.5" onClick={() => onEdit(asset)}>
                <PencilIcon className="size-4" />
                {t("editButton")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
