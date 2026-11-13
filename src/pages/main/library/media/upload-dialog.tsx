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
import { useTranslations } from "@/i18n";
import { MusicIcon, PlayIcon, UploadIcon, XIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drop or pick images, videos and audio, tag them once, upload them one by one. */
export function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after an upload run (even a partly failed one) so the page can reload. */
  onUploaded: () => void;
}) {
  const t = useTranslations("videoStudio.library");
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => setFiles((prev) => [...prev, ...accepted]),
    accept: { "image/*": [], "video/*": [], "audio/*": [] },
    disabled: uploading,
  });

  const close = () => {
    if (uploading) return;
    setFiles([]);
    setErrors([]);
    onOpenChange(false);
  };

  const upload = async () => {
    setUploading(true);
    setErrors([]);
    const failed: File[] = [];
    const messages: string[] = [];
    for (const file of files) {
      try {
        await apiClient.assets.library.upload(file, { tags });
      } catch (err) {
        failed.push(file);
        messages.push(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setUploading(false);
    onUploaded();
    // Keep only what failed, so it can be retried; close when everything went through.
    setFiles(failed);
    setErrors(messages);
    if (failed.length === 0) {
      setTags("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("uploadTitle")}</DialogTitle>
          <DialogDescription>{t("uploadDescription")}</DialogDescription>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            isDragActive
              ? "border-brand-400 bg-brand-50 dark:border-brand-500/60 dark:bg-brand-500/10"
              : "border-gray-300 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-brand-500/40 dark:hover:bg-white/[0.03]",
          )}
        >
          <input {...getInputProps()} />
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
            <UploadIcon className="size-5" />
          </span>
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
            {isDragActive ? t("dropActive") : t("dropHere")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("dropHint")}</p>
        </div>

        {files.length > 0 && (
          <ul className="custom-scrollbar max-h-48 space-y-1 overflow-y-auto">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {file.type.startsWith("audio/") ? (
                    <MusicIcon className="size-4" />
                  ) : file.type.startsWith("video/") ? (
                    <PlayIcon className="size-3.5" />
                  ) : (
                    <UploadIcon className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={t("removeFile")}
                  disabled={uploading}
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Field>
          <FieldLabel>{t("tagsLabel")}</FieldLabel>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("uploadTagsPlaceholder")} />
        </Field>

        {errors.length > 0 && (
          <div className="space-y-0.5 text-sm text-red-500 dark:text-red-400">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={uploading} onClick={close}>
            {t("cancel")}
          </Button>
          <Button type="button" className="gap-1.5" disabled={uploading || files.length === 0} onClick={() => void upload()}>
            {uploading ? <Spinner /> : <UploadIcon className="size-4" />}
            {t("uploadSubmit", { count: files.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
