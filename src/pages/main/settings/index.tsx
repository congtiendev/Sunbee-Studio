import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { OverflowTabsList } from "@/components/ui/overflow-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { useState } from "react";
import ApiKeysSection from "@/pages/main/settings/categories/api-keys-section";
import BackupSection from "@/pages/main/settings/categories/backup-section";
import McpSection from "@/pages/main/settings/categories/mcp-section";
import PlaceholderSection from "@/pages/main/settings/categories/placeholder-section";
import PromptsSection from "@/pages/main/settings/categories/prompts-section";
import ResearchKeysSection from "@/pages/main/settings/categories/research-keys-section";
import type { SettingsCategoryKey } from "@/pages/main/settings/types";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");

  const [category, setCategory] = useState<SettingsCategoryKey>("apiKeys");

  return (
    <div>
      <PageMeta title={t("metaTitle")} description={t("metaDescription")} />
      <PageBreadcrumb pageTitle={t("title")} />

      <Tabs
        orientation="horizontal"
        value={category}
        onValueChange={(value) => setCategory(value as SettingsCategoryKey)}
      >
        <OverflowTabsList
          variant="line"
          value={category}
          onValueChange={(value) => setCategory(value as SettingsCategoryKey)}
          moreLabel={tCommon("moreTabs")}
          items={(
            [
              "apiKeys",
              "prompts",
              "mcp",
              "backup",
              "general",
              "updates",
            ] as const
          ).map((key) => ({ value: key, label: t(`categories.${key}`) }))}
        />

        <TabsContent value="apiKeys">
          <ApiKeysSection />
          <ResearchKeysSection />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptsSection />
        </TabsContent>
        <TabsContent value="mcp">
          <McpSection />
        </TabsContent>
        <TabsContent value="backup">
          <BackupSection />
        </TabsContent>
        <TabsContent value="general">
          <PlaceholderSection title={t("comingSoon")} />
        </TabsContent>
        <TabsContent value="updates">
          <PlaceholderSection title={t("comingSoon")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
