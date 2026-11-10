import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { TrainingCandidate, TrainingImageSummary } from "@shared/types";
import { useRef, useState } from "react";
import AddStatusList from "./add-status-list";
import { errorMessage, type AddStatus, type SourceAdderProps } from "./types";

function asCandidate(image: TrainingImageSummary): TrainingCandidate {
  return {
    kind: "image",
    id: image.id,
    title: image.title,
    group: "",
    excerpt: "",
    charCount: 0,
    badges: ["new"],
    previewUrl: apiClient.documents.fileUrl(image.fileId),
  };
}

/** Upload example images for an image skill; saved to a reusable library. */
export default function ImageAdder({ onAdded, disabled }: SourceAdderProps) {
  const t = useTranslations("training.adders.image");
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<{ label: string; status: AddStatus }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);

  const setStatus = (index: number, status: AddStatus) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status } : item)),
    );

  const uploadAll = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setItems(
      files.map((file) => ({ label: file.name, status: { state: "waiting" } })),
    );
    for (const [index, file] of files.entries()) {
      setStatus(index, { state: "working" });
      try {
        const image = await apiClient.training.uploadImage(file);
        onAdded(asCandidate(image));
        setStatus(index, { state: "done" });
      } catch (err) {
        setStatus(index, { state: "error", message: errorMessage(err) });
      }
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void uploadAll(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
        >
          <UploadIcon className="size-4" />
          {t("upload")}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("hint")}
        </span>
      </div>
      <AddStatusList items={items} />
    </div>
  );
}
