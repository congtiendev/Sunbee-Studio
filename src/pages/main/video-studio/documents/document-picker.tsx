import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import type { DocumentSummary } from "@shared/types";
import { Link } from "react-router";
import { documentTypeLabel, formatCharCount } from "./utils";

/** Checkbox list of the user's documents (skill knowledge, script sources...). */
export default function DocumentPicker({
  documents,
  loading,
  selected,
  onChange,
  max,
}: {
  documents: DocumentSummary[];
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Disable unchecked items once this many are selected. */
  max?: number;
}) {
  const t = useTranslations("videoStudio.documents");

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (documents.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("picker.empty")}{" "}
        <Link to="/video-studio/documents" className="text-brand-500 hover:underline dark:text-brand-400">
          {t("picker.manageLink")}
        </Link>
      </p>
    );
  }

  const full = max !== undefined && selected.length >= max;

  return (
    <div className="max-h-60 space-y-1.5 overflow-y-auto pe-1 custom-scrollbar">
      {documents.map((doc) => {
        const checked = selected.includes(doc.id);
        const disabled = !checked && full;
        return (
          <label
            key={doc.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
              checked
                ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                : "border-gray-200 dark:border-gray-800",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-gray-300 dark:hover:border-gray-700",
            )}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(value) =>
                onChange(value ? [...selected, doc.id] : selected.filter((id) => id !== doc.id))
              }
            />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
              {doc.title}
            </span>
            <Badge variant="light" color="gray" size="sm" className="shrink-0">
              {documentTypeLabel(doc.mime)}
            </Badge>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {t("charCount", { count: formatCharCount(doc.charCount) })}
            </span>
          </label>
        );
      })}
    </div>
  );
}
