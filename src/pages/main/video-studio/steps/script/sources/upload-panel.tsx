import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TrashBinIcon, UploadIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import { useDropzone } from "react-dropzone";
import ProviderModelFields from "../provider-model-fields";
import type { ScriptLanguage } from "../use-script-step";
import type { ScriptSourcePanelProps } from "./registry";

/** Matches the server's cap — a safety net against an accidental huge
 * upload, not a feature limit; the video's audio is compressed server-side
 * before transcription, so video length doesn't matter. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPanel({ step }: ScriptSourcePanelProps) {
  const t = useTranslations("videoStudio.script");

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } =
    useDropzone({
      onDrop: (accepted) => step.setUploadFile(accepted[0] ?? null),
      accept: {
        "video/mp4": [".mp4"],
        "video/webm": [".webm"],
        "video/quicktime": [".mov"],
      },
      maxSize: MAX_UPLOAD_BYTES,
      maxFiles: 1,
    });

  return (
    <Field>
      <FieldLabel>{t("uploadVideo")}</FieldLabel>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center outline-hidden transition-all duration-200",
          isDragReject
            ? "border-red-500 bg-red-50/60 dark:bg-red-950/20"
            : isDragAccept
              ? "border-brand-500 bg-brand-50/60 dark:bg-brand-950/20"
              : "border-gray-300 bg-gray-50 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500",
        )}
      >
        <input {...getInputProps()} />
        <UploadIcon className="mb-3 size-7 text-gray-500 dark:text-gray-400" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {isDragActive ? t("uploadDropActive") : t("uploadDropHint")}
        </p>
      </div>

      {step.uploadFile && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-gray-700 dark:text-gray-300">
              {step.uploadFile.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(step.uploadFile.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => step.setUploadFile(null)}
            className="shrink-0 text-gray-400 hover:text-red-500"
            aria-label={t("uploadRemove")}
          >
            <TrashBinIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <ProviderModelFields
          providerLabel={t("describeProviderLabel")}
          provider={step.describeProvider}
          onProviderChange={step.changeDescribeProvider}
          model={step.describeModel}
          onModelChange={step.setDescribeModel}
          availableProviders={step.availableProviders}
        />

        <Field className="w-40">
          <FieldLabel>{t("scriptLanguageLabel")}</FieldLabel>
          <Select
            value={step.scriptLanguage}
            onValueChange={(value) => step.setScriptLanguage(value as ScriptLanguage)}
          >
            <SelectTrigger>
              <SelectValue>
                {() =>
                  step.scriptLanguage === "vi" ? t("scriptLanguageVi") : t("scriptLanguageEn")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">{t("scriptLanguageVi")}</SelectItem>
              <SelectItem value="en">{t("scriptLanguageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {t("describeProviderHint")}
      </p>

      <Button
        type="button"
        className="mt-3"
        onClick={() => void step.transcribeUpload()}
        disabled={!step.uploadFile || step.transcribing}
      >
        {step.transcribing && <Spinner />}
        {t("uploadButton")}
      </Button>
      {step.transcribing && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {t("transcribingHint")}
        </p>
      )}
    </Field>
  );
}
