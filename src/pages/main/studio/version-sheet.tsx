import { SkeletonCard } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslations } from "@/i18n";
import { TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type { ScriptAnalysisRecord, StyleTemplate } from "@shared/types";
import { useEffect, useState } from "react";

interface VersionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  currentVersionId: string | null;
  onSelect: (record: ScriptAnalysisRecord) => void;
}

export default function VersionSheet({
  open,
  onOpenChange,
  videoId,
  currentVersionId,
  onSelect,
}: VersionSheetProps) {
  const t = useTranslations("videoStudio.script");

  const [rows, setRows] = useState<ScriptAnalysisRecord[]>([]);
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([apiClient.script.history(videoId), apiClient.templates.list()])
      .then(([data, allTemplates]) => {
        if (!active) return;
        setRows(data);
        setTemplates(allTemplates);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, videoId]);

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.script.deleteHistory(id);
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("history.title")}</SheetTitle>
          <SheetDescription>{t("history.description")}</SheetDescription>
        </SheetHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("history.empty")}
          </p>
        ) : (
          <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
            {rows.map((row) => (
              // The delete button is a sibling of the select button, not a child:
              // nesting <button>s is invalid HTML and React warns about it.
              <div key={row.id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-4 pe-12 text-start transition-colors",
                    row.id === currentVersionId
                      ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          row.kind === "analyzed"
                            ? "bg-green-500"
                            : "bg-gray-400",
                        )}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {row.kind === "analyzed"
                          ? t("version.analyzed")
                          : t("version.draft")}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                      <Badge
                        variant="light"
                        color={row.sourceType === "youtube" ? "info" : "gray"}
                        size="sm"
                      >
                        {t(`history.sources.${row.sourceType}`)}
                      </Badge>
                      {row.approved && (
                        <Badge variant="light" color="success" size="sm">
                          {t("approve.approvedBadge")}
                        </Badge>
                      )}
                    </div>
                    {row.sourceUrl && (
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                        {row.sourceUrl}
                      </p>
                    )}
                    <p className="mt-2 line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
                      {row.scriptText}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t("history.sceneCount", { count: row.scenes.length })}
                    </p>
                    {(row.provider || row.language || row.styleTemplateId || row.editingStyleTemplateId) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.provider && (
                          <Badge variant="light" color="gray" size="sm">
                            {row.provider}
                            {row.model ? ` · ${row.model}` : ""}
                          </Badge>
                        )}
                        {row.language && (
                          <Badge variant="light" color="gray" size="sm">
                            {t(`history.language.${row.language}`)}
                          </Badge>
                        )}
                        {row.styleTemplateId && templateName(row.styleTemplateId) && (
                          <Badge variant="light" color="primary" size="sm">
                            {templateName(row.styleTemplateId)}
                          </Badge>
                        )}
                        {row.editingStyleTemplateId &&
                          templateName(row.editingStyleTemplateId) && (
                            <Badge variant="light" color="primary" size="sm">
                              {templateName(row.editingStyleTemplateId)}
                            </Badge>
                          )}
                      </div>
                    )}
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute end-4 top-4"
                  disabled={deletingId === row.id}
                  onClick={() => void handleDelete(row.id)}
                >
                  <TrashBinIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
