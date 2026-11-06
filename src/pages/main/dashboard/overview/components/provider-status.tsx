import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts";
import { useTranslations } from "@/i18n";
import { ClaudeIcon, GptIcon, PluginIcon } from "@/icons";
import type { AppSettings } from "@shared/types";
import type { ApexOptions } from "apexcharts";
import React from "react";
import ReactApexChart from "react-apexcharts";

interface ProviderStatProps {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  detail?: string;
  connectedLabel: string;
  notConnectedLabel: string;
}

function ProviderStat({
  icon,
  label,
  connected,
  detail,
  connectedLabel,
  notConnectedLabel,
}: ProviderStatProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </span>
      <Badge size="sm" color={connected ? "success" : "gray"}>
        {detail ?? (connected ? connectedLabel : notConnectedLabel)}
      </Badge>
    </div>
  );
}

export default function ProviderStatus({
  settings,
}: {
  settings: AppSettings;
}) {
  const { theme } = useTheme();
  const t = useTranslations("overview.providerStatus");

  const openaiConnected = Boolean(settings.openaiApiKey);
  const anthropicKeyCount = settings.anthropicApiKeys?.length ?? 0;
  const anthropicConnected = anthropicKeyCount > 0;
  const configuredCount =
    Number(openaiConnected) + Number(anthropicConnected);
  const percent = Math.round((configuredCount / 2) * 100);

  const options: ApexOptions = {
    colors: ["#68D8FD"],
    chart: {
      fontFamily: "Comfortaa, sans-serif",
      type: "radialBar",
      height: 280,
      sparkline: { enabled: true },
    },
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: "75%" },
        track: {
          background: theme === "dark" ? "#1E2640" : "#E4E7EC",
          strokeWidth: "100%",
          margin: 5,
        },
        dataLabels: {
          name: { show: false },
          value: {
            fontSize: "32px",
            fontWeight: "600",
            offsetY: -20,
            color: theme === "dark" ? "#FFFFFF" : "#1D2939",
            formatter: (val: number) => `${val}%`,
          },
        },
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "light",
        type: "horizontal",
        shadeIntensity: 0.5,
        gradientToColors: ["#00B3EC"],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 1,
        stops: [0, 100],
      },
    },
    stroke: { lineCap: "round" },
    labels: [t("title")],
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/3">
      <div className="shadow-default flex flex-1 flex-col justify-between rounded-2xl bg-white px-5 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-8 dark:bg-gray-900">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("title")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("subtitle")}
          </p>
        </div>

        <div className="max-h-50 overflow-hidden">
          <ReactApexChart
            options={options}
            series={[percent]}
            type="radialBar"
            height={280}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
        <ProviderStat
          icon={<GptIcon className="size-4" />}
          label={t("openai")}
          connected={openaiConnected}
          connectedLabel={t("connected")}
          notConnectedLabel={t("notConnected")}
        />
        <div className="h-7 w-px bg-gray-200 dark:bg-gray-800" />
        <ProviderStat
          icon={<ClaudeIcon className="size-4" />}
          label={t("claude")}
          connected={anthropicConnected}
          detail={
            anthropicConnected
              ? t("keys", { count: anthropicKeyCount })
              : undefined
          }
          connectedLabel={t("connected")}
          notConnectedLabel={t("notConnected")}
        />
        <div className="h-7 w-px bg-gray-200 dark:bg-gray-800" />
        <ProviderStat
          icon={<PluginIcon className="size-4" />}
          label={t("mcp")}
          connected={Boolean(settings.mcpEnabled)}
          connectedLabel={t("enabled")}
          notConnectedLabel={t("disabled")}
        />
      </div>
    </div>
  );
}
