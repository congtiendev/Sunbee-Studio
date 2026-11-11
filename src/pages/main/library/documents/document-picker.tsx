import { SkeletonLines } from "@/components/shared/skeleton-blocks";
import { useTranslations } from "@/i18n";
import { CheckIcon, DocIcon } from "@/icons";
import { paths } from "@/lib/paths";
import { cn } from "@/utils";
import type { DocumentSummary } from "@shared/types";
import { Link } from "react-router";
import { documentTypeLabel, formatCharCount } from "./utils";

/** Tile color per file type, Drive-style, so the grid reads at a glance. */
const TYPE_COLOR: Record<string, string> = {
  PDF: "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400",
  DOCX: "bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400",
  MD: "bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-400",
  CSV: "bg-green-50 text-green-500 dark:bg-green-500/10 dark:text-green-400",
  JSON: "bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400",
  TXT: "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400",
};

/** Icon-tile grid of the user's documents (skill knowledge, script sources...), Drive-style. */
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
    return <SkeletonLines count={3} />;
  }
  if (documents.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("picker.empty")}{" "}
        <Link to={paths.libraryDocuments} className="text-brand-500 hover:underline dark:text-brand-400">
          {t("picker.manageLink")}
        </Link>
      </p>
    );
  }

  const full = max !== undefined && selected.length >= max;

  return (
    <div className="flex max-h-72 flex-wrap gap-2.5 overflow-y-auto pe-1 pt-1 custom-scrollbar">
      {documents.map((doc) => {
        const checked = selected.includes(doc.id);
        const disabled = !checked && full;
        const typeLabel = documentTypeLabel(doc.mime);
        return (
          <button
            key={doc.id}
            type="button"
            title={doc.title}
            disabled={disabled}
            onClick={() =>
              onChange(checked ? selected.filter((id) => id !== doc.id) : [...selected, doc.id])
            }
            className={cn(
              "relative flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
              checked
                ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            {checked && (
              <span className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full bg-brand-500 text-white dark:bg-brand-400">
                <CheckIcon className="size-3" />
              </span>
            )}
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-lg",
                TYPE_COLOR[typeLabel] ?? TYPE_COLOR.TXT,
              )}
            >
              <DocIcon className="size-6" />
            </div>
            <span className="line-clamp-2 w-full text-xs leading-tight text-gray-700 dark:text-gray-300">
              {doc.title}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {typeLabel} · {t("charCount", { count: formatCharCount(doc.charCount) })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
