import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { OverflowTabsList } from "@/components/ui/overflow-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { useState } from "react";
import LogsSection from "@/pages/main/database-admin/categories/logs-section";
import ScriptAnalysesSection from "@/pages/main/database-admin/categories/script-analyses-section";
import StyleTemplatesSection from "@/pages/main/database-admin/categories/style-templates-section";
import TrashSection from "@/pages/main/database-admin/categories/trash-section";
import UsersSection from "@/pages/main/database-admin/categories/users-section";
import type { DatabaseAdminCategoryKey } from "@/pages/main/database-admin/types";

export default function DatabaseAdminPage() {
  const t = useTranslations("databaseAdmin");
  const tCommon = useTranslations("common");

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
        <OverflowTabsList
          variant="line"
          value={category}
          onValueChange={(value) =>
            setCategory(value as DatabaseAdminCategoryKey)
          }
          moreLabel={tCommon("moreTabs")}
          items={(
            [
              "scriptAnalyses",
              "styleTemplates",
              "users",
              "trash",
              "logs",
            ] as const
          ).map((key) => ({
            value: key,
            label: t(`categories.${key}`),
          }))}
        />

        <TabsContent value="scriptAnalyses">
          <ScriptAnalysesSection />
        </TabsContent>
        <TabsContent value="styleTemplates">
          <StyleTemplatesSection />
        </TabsContent>
        <TabsContent value="users">
          <UsersSection />
        </TabsContent>
        <TabsContent value="trash">
          <TrashSection />
        </TabsContent>
        <TabsContent value="logs">
          <LogsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
