import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { DownloadIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { DataExportBundle, DataImportResult } from "@shared/types";
import { useRef, useState } from "react";

export default function BackupSection() {
  const t = useTranslations("settings.backup");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataImportResult | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const bundle = await apiClient.data.export();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sunbee-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as DataExportBundle;
      const summary = await apiClient.data.import(bundle);
      setResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
            {t("title")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("description")}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <AlertDescription>
              {t("importSummary", {
                projects: result.projects,
                categories: result.categories,
                videos: result.videos,
                scriptAnalyses: result.scriptAnalyses,
                styleTemplates: result.styleTemplates,
                anthropicKeys: result.anthropicKeys,
              })}
              {result.openaiKeyImported && ` ${t("importOpenaiKey")}`}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? <Spinner /> : <DownloadIcon className="size-4" />}
            {t("exportButton")}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Spinner /> : <UploadIcon className="size-4" />}
            {t("importButton")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("warning")}
        </p>
      </CardContent>
    </Card>
  );
}
