import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { useRef, useState } from "react";
import AddStatusList from "./add-status-list";
import {
  MIN_SCRIPT_CHARS,
  errorMessage,
  type AddStatus,
  type SourceAdderProps,
} from "./types";

/** Same limit as the Script step's upload (and the server). */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Upload video files; each one is transcribed like in the Script step. */
export default function UploadAdder({
  ai,
  onAdded,
  disabled,
}: SourceAdderProps) {
  const t = useTranslations("training.adders.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<{ label: string; status: AddStatus }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);

  const setStatus = (index: number, status: AddStatus) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status } : item)),
    );

  const transcribeAll = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setItems(
      files.map((file) => ({ label: file.name, status: { state: "waiting" } })),
    );
    // One at a time: each upload is a full transcription.
    for (const [index, file] of files.entries()) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus(index, { state: "error", message: t("tooLarge") });
        continue;
      }
      setStatus(index, { state: "working" });
      try {
        const result = await apiClient.script.transcribeUpload(
          file,
          undefined,
          ai.provider,
          ai.model,
          "vi",
        );
        const script = result.scriptText.trim();
        if (!result.versionId || script.length < MIN_SCRIPT_CHARS) {
          setStatus(index, { state: "error", message: t("tooShort") });
          continue;
        }
        onAdded({
          kind: "upload",
          id: result.versionId,
          title: file.name,
          group: "",
          excerpt: script.slice(0, 200),
          charCount: script.length,
          badges: ["new"],
        });
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
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void transcribeAll(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
        >
          <UploadIcon className="size-4" />
          {busy ? t("transcribing") : t("pick")}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("hint")}
        </span>
      </div>
      <AddStatusList items={items} />
    </div>
  );
}
