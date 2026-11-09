import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { DocIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import PasteTextDialog from "@/pages/main/library/documents/paste-text-dialog";
import { DOCUMENT_ACCEPT } from "@/pages/main/library/documents/utils";
import type { DocumentSummary, TrainingCandidate } from "@shared/types";
import { useRef, useState } from "react";
import AddStatusList from "./add-status-list";
import { errorMessage, type AddStatus, type SourceAdderProps } from "./types";

function asCandidate(doc: DocumentSummary): TrainingCandidate {
  return {
    kind: "document",
    id: doc.id,
    title: doc.title,
    group: "",
    excerpt: "",
    charCount: doc.charCount,
    badges: ["new"],
  };
}

/** Upload document files or paste text; both land in the document library too. */
export default function DocumentAdder({ onAdded, disabled }: SourceAdderProps) {
  const t = useTranslations("training.adders.document");
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<{ label: string; status: AddStatus }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

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
        const doc = await apiClient.documents.upload(file);
        if (doc.charCount === 0) {
          setStatus(index, { state: "error", message: t("noText") });
          continue;
        }
        onAdded(asCandidate(doc));
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
        accept={DOCUMENT_ACCEPT}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setPasteOpen(true)}
          disabled={busy || disabled}
        >
          <DocIcon className="size-4" />
          {t("paste")}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("hint")}
        </span>
      </div>
      <AddStatusList items={items} />
      <PasteTextDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onCreated={(doc) => {
          setPasteOpen(false);
          onAdded(asCandidate(doc));
        }}
      />
    </div>
  );
}
