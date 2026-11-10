import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonTable } from "@/components/shared/skeleton-blocks";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { LogEntry } from "@shared/types";
import { useCallback, useEffect, useState } from "react";

const LEVEL_BADGE: Record<LogEntry["level"], { color: "error" | "warning" | "gray"; variant: "solid" | "light" }> = {
  error: { color: "error", variant: "solid" },
  warn: { color: "warning", variant: "solid" },
  info: { color: "gray", variant: "light" },
};

export default function LogsSection() {
  const t = useTranslations("databaseAdmin.logs");

  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [level, setLevel] = useState<string>("all");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (date: string | undefined, levelFilter: string) => {
      setLoading(true);
      setError(null);
      apiClient.admin
        .logs({ date, level: levelFilter === "all" ? undefined : levelFilter })
        .then((res) => {
          setDates(res.dates);
          setEntries(res.entries);
          setSelectedDate((prev) => prev ?? res.dates[0]);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(selectedDate, level);
     
  }, [selectedDate, level]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={selectedDate}
              onValueChange={(value) => setSelectedDate(value as string)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("selectDate")} />
              </SelectTrigger>
              <SelectContent>
                {dates.map((date) => (
                  <SelectItem key={date} value={date}>
                    {date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={level} onValueChange={(value) => setLevel(value as string)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allLevels")}</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => load(selectedDate, level)}
          >
            {t("refresh")}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : entries.length === 0 ? (
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
                    {t("time")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("level")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("message")}
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t("details")}
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((entry, index) => {
                  const { time, level: entryLevel, message, ...meta } = entry;
                  const badge = LEVEL_BADGE[entryLevel] ?? LEVEL_BADGE.info;
                  return (
                    <TableRow key={`${time}-${index}`}>
                      <TableCell className="px-4 py-3 align-top text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {new Date(time).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <Badge variant={badge.variant} color={badge.color}>
                          {entryLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                        {message}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-xs break-all text-gray-500 dark:text-gray-400">
                        {Object.keys(meta).length > 0 ? JSON.stringify(meta) : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
