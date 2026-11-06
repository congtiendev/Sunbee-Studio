import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import { TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { ScriptAnalysisRecord } from "@shared/types";
import { useEffect, useState } from "react";

export default function ScriptAnalysesSection() {
  const t = useTranslations("databaseAdmin.scriptAnalyses");

  const [rows, setRows] = useState<ScriptAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.script.history();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    await apiClient.script.deleteHistory(id);
    void load();
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("owner")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("createdAt")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("source")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("scenes")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.ownerEmail ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {row.sourceType}
                      {row.sourceUrl ? ` · ${row.sourceUrl}` : ""}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {row.scenes.length}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void handleDelete(row.id)}
                      >
                        <TrashBinIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
