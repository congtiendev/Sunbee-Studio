import { SkeletonTable } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { User } from "@shared/types";
import { useEffect, useState } from "react";

export default function UsersSection() {
  const t = useTranslations("databaseAdmin.users");

  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.auth
      .listUsers()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                <TableRow>
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
                    {t("email")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("role")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("createdAt")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {row.email}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant={row.role === "admin" ? "solid" : "light"}
                        color={row.role === "admin" ? "success" : "gray"}
                      >
                        {row.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(row.createdAt).toLocaleString()}
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
