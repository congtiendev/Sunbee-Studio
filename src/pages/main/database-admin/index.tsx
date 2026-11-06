import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { useState } from "react";
import LogsSection from "@/pages/main/database-admin/categories/logs-section";
import ScriptAnalysesSection from "@/pages/main/database-admin/categories/script-analyses-section";
import StyleTemplatesSection from "@/pages/main/database-admin/categories/style-templates-section";
import UsersSection from "@/pages/main/database-admin/categories/users-section";
import type { DatabaseAdminCategoryKey } from "@/pages/main/database-admin/types";

export default function DatabaseAdminPage() {
  const t = useTranslations("databaseAdmin");

  const [category, setCategory] =
    useState<DatabaseAdminCategoryKey>("scriptAnalyses");

  return (
    <div>
      <PageMeta title={t("metaTitle")} description={t("metaDescription")} />
      <PageBreadcrumb pageTitle={t("title")} />

      <Tabs
        orientation="horizontal"
        value={category}
        onValueChange={(value) =>
          setCategory(value as DatabaseAdminCategoryKey)
        }
      >
        <TabsList variant="line">
          <TabsTrigger value="scriptAnalyses">
            {t("categories.scriptAnalyses")}
          </TabsTrigger>
          <TabsTrigger value="styleTemplates">
            {t("categories.styleTemplates")}
          </TabsTrigger>
          <TabsTrigger value="users">{t("categories.users")}</TabsTrigger>
          <TabsTrigger value="logs">{t("categories.logs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="scriptAnalyses">
          <ScriptAnalysesSection />
        </TabsContent>
        <TabsContent value="styleTemplates">
          <StyleTemplatesSection />
        </TabsContent>
        <TabsContent value="users">
          <UsersSection />
        </TabsContent>
        <TabsContent value="logs">
          <LogsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
