import { useTheme } from "@/contexts";
import { useTranslations } from "@/i18n";
import type { ScriptAnalysisRecord } from "@shared/types";
import type { ApexOptions } from "apexcharts";
import { useMemo } from "react";
import ReactApexChart from "react-apexcharts";

const DAYS = 14;

function buildSeries(records: ScriptAnalysisRecord[]) {
  const counts = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const keys: string[] = [];
  const labels: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    keys.push(key);
    labels.push(
      day.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }),
    );
    counts.set(key, 0);
  }

  for (const record of records) {
    const key = record.createdAt.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return { labels, values: keys.map((key) => counts.get(key) ?? 0) };
}

export default function ActivityChart({
  data,
}: {
  data: ScriptAnalysisRecord[];
}) {
  const { theme } = useTheme();
  const t = useTranslations("overview.activity");

  const { labels, values } = useMemo(() => buildSeries(data), [data]);

  const options: ApexOptions = {
    colors: ["#00B3EC"],
    chart: {
      fontFamily: "Comfortaa, sans-serif",
      type: "area",
      height: 260,
      toolbar: { show: false },
    },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.55, opacityTo: 0 },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 6 },
    },
    grid: {
      borderColor: theme === "dark" ? "#1E2640" : "#F3F4F6",
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          fontSize: "12px",
          fontFamily: "Comfortaa, sans-serif",
          colors: theme === "dark" ? "#94A3B8" : "#6B7280",
        },
      },
    },
    yaxis: {
      min: 0,
      tickAmount: 4,
      labels: {
        formatter: (val: number) => Math.round(val).toString(),
        style: {
          fontSize: "12px",
          fontFamily: "Comfortaa, sans-serif",
          colors: theme === "dark" ? "#94A3B8" : "#6B7280",
        },
      },
    },
    tooltip: {
      y: { formatter: (val: number) => Math.round(val).toString() },
    },
  };

  const series = [{ name: t("series"), data: values }];

  return (
    <div className="card-surface px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("title")}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("subtitle")}
        </p>
      </div>

      <ReactApexChart
        options={options}
        series={series}
        type="area"
        height={260}
      />
    </div>
  );
}
