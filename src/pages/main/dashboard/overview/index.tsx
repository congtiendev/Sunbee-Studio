import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { FolderIcon, LayerIcon, TagIcon, TextIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type {
  AppSettings,
  Project,
  ScriptAnalysisRecord,
  StyleTemplate,
} from "@shared/types";
import { useEffect, useState } from "react";
import ActivityChart from "@/pages/main/dashboard/overview/components/activity-chart";
import MetricCard from "@/pages/main/dashboard/overview/components/metric-card";
import ProviderStatus from "@/pages/main/dashboard/overview/components/provider-status";
import RecentAnalyses from "@/pages/main/dashboard/overview/components/recent-analyses";
import RecentProjects from "@/pages/main/dashboard/overview/components/recent-projects";

interface OverviewData {
  projects: Project[];
  templates: StyleTemplate[];
  analyses: ScriptAnalysisRecord[];
  settings: AppSettings;
}

export default function OverviewPage() {
  const t = useTranslations("overview");

  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [projects, templates, analyses, settings] = await Promise.all([
          apiClient.projects.list(),
          apiClient.templates.list(),
          apiClient.script.history(),
          apiClient.settings.get(),
        ]);
        if (!cancelled) setData({ projects, templates, analyses, settings });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalScenes =
    data?.analyses.reduce((sum, record) => sum + record.scenes.length, 0) ??
    0;

  return (
    <>
      <PageMeta title={t("title")} description={t("title")} />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <img
            src="/images/banner/sunbee-banner-web.png"
            alt="Sunbee Studio"
            className="h-auto w-full"
          />
        </div>

        {error && (
          <div className="col-span-12">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {!data && !error && (
          <div className="col-span-12 flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {data && (
          <>
            <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
              <MetricCard
                icon={<FolderIcon />}
                title={t("metrics.projects")}
                value={data.projects.length}
              />
              <MetricCard
                icon={<TextIcon />}
                title={t("metrics.scriptAnalyses")}
                value={data.analyses.length}
              />
              <MetricCard
                icon={<LayerIcon />}
                title={t("metrics.scenesPlanned")}
                value={totalScenes}
              />
              <MetricCard
                icon={<TagIcon />}
                title={t("metrics.styleTemplates")}
                value={data.templates.length}
              />
            </div>

            <div className="col-span-12 xl:col-span-7">
              <ActivityChart data={data.analyses} />
            </div>

            <div className="col-span-12 xl:col-span-5">
              <ProviderStatus settings={data.settings} />
            </div>

            <div className="col-span-12 xl:col-span-7">
              <RecentAnalyses data={data.analyses} />
            </div>

            <div className="col-span-12 xl:col-span-5">
              <RecentProjects data={data.projects} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
