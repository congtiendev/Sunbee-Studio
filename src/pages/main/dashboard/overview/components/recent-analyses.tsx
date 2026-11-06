import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import type { ScriptAnalysisRecord } from "@shared/types";
import { Link } from "react-router";

export default function RecentAnalyses({
  data,
}: {
  data: ScriptAnalysisRecord[];
}) {
  const t = useTranslations("overview.recentAnalyses");
  const tCommon = useTranslations("common");

  const rows = data.slice(0, 6);

  return (
    <div className="card-surface overflow-hidden px-4 pt-4 pb-3 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("title")}
        </h3>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/video-studio" />}
        >
          {tCommon("seeAll")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("empty")}
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell
                  isHeader
                  className="py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {t("source")}
                </TableCell>
                <TableCell
                  isHeader
                  className="py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {t("scenes")}
                </TableCell>
                <TableCell
                  isHeader
                  className="py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {t("status")}
                </TableCell>
                <TableCell
                  isHeader
                  className="py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {t("createdAt")}
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="py-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {t(`sourceTypes.${row.sourceType}`)}
                    </p>
                    {row.sourceUrl && (
                      <span className="line-clamp-1 max-w-62.5 text-xs text-gray-500 dark:text-gray-400">
                        {row.sourceUrl}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-500 dark:text-gray-400">
                    {row.scenes.length}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      size="sm"
                      color={row.kind === "analyzed" ? "success" : "warning"}
                    >
                      {t(`statuses.${row.kind}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
