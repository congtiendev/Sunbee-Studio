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
import { apiClient } from "@/lib/api-client";
import type { LibraryAsset } from "@shared/types";
import { useEffect, useRef, useState } from "react";

const MAX_RESULTS = 60;

/** Picks a scene's image from the image library, or uploads a new one (which also lands in the library). */
export default function ImagePickerDialog({
  open,
  onOpenChange,
  hint,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scene's AI-written description of the picture it needs. */
  hint: string;
  onPick: (fileId: string) => void;
}) {
  const t = useTranslations("videoRender.imagePicker");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryAsset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const id = setTimeout(() => {
      void apiClient.assets.library
        .list({ q: query.trim() || undefined, type: "image" })
        .then((assets) => active && setResults(assets.slice(0, MAX_RESULTS)))
        .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    }, 300);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [open, query]);

  const pick = (fileId: string) => {
    onPick(fileId);
    onOpenChange(false);
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const asset = await apiClient.assets.library.upload(file, { description: hint });
      pick(asset.fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {hint && <DialogDescription>{t("hint", { hint })}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-0 flex-1"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading && <Spinner />}
            {t("upload")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {results === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{t("empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {results.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => pick(asset.fileId)}
                  className="group overflow-hidden rounded-lg border border-gray-200 text-start transition hover:border-brand-400 dark:border-gray-800 dark:hover:border-brand-500/60"
                >
                  <img
                    src={`/api/files/${asset.fileId}`}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <span className="block truncate px-2 py-1 text-xs text-gray-600 dark:text-gray-400">
                    {asset.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
