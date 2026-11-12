import { SkeletonTable } from "@/components/shared/skeleton-blocks";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import { RegenerateIcon, TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { TrashItem, TrashItemType } from "@shared/types";
import { useEffect, useState } from "react";
import TablePagination from "../table-pagination";
import { usePageSlice } from "../use-page-slice";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const TYPE_COLOR: Record<TrashItemType, "primary" | "info" | "warning"> = {
  project: "primary",
  category: "info",
  video: "warning",
};

export default function TrashSection() {
  const t = useTranslations("databaseAdmin.trash");

  const [rows, setRows] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const { pageItems, totalPages, page: currentPage } = usePageSlice(rows, page);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiClient.data.trash());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await apiClient.data.restoreTrash(item.type, item.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    await apiClient.data.purgeTrash(purgeTarget.type, purgeTarget.id);
    await load();
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("type")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("name")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("parent")}
                  </TableCell>
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
                    {t("deletedAt")}
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pageItems.map((item) => (
                  <TableRow key={`${item.type}:${item.id}`}>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="light"
                        color={TYPE_COLOR[item.type]}
                        size="sm"
                      >
                        {t(`types.${item.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {item.parentLabel ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {item.ownerEmail ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(item.deletedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={t("restore")}
                          aria-label={t("restore")}
                          disabled={busyId === item.id}
                          onClick={() => void handleRestore(item)}
                        >
                          <RegenerateIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={t("purge")}
                          aria-label={t("purge")}
                          disabled={busyId === item.id}
                          onClick={() => setPurgeTarget(item)}
                        >
                          <TrashBinIcon className="size-4 text-red-500 dark:text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <TablePagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </CardContent>

      <ConfirmDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        title={t("purgeTitle", { name: purgeTarget?.name ?? "" })}
        description={
          purgeTarget ? t(`purgeDescription.${purgeTarget.type}`) : undefined
        }
        confirmLabel={t("purge")}
        onConfirm={handlePurge}
      />
    </Card>
  );
}
