import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { useState } from "react";
import ApiKeysSection from "@/pages/main/settings/categories/api-keys-section";
import BackupSection from "@/pages/main/settings/categories/backup-section";
import McpSection from "@/pages/main/settings/categories/mcp-section";
import PlaceholderSection from "@/pages/main/settings/categories/placeholder-section";
import type { SettingsCategoryKey } from "@/pages/main/settings/types";

export default function SettingsPage() {
  const t = useTranslations("settings");

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
        <TabsList variant="line">
          <TabsTrigger value="apiKeys">{t("categories.apiKeys")}</TabsTrigger>
          <TabsTrigger value="mcp">{t("categories.mcp")}</TabsTrigger>
          <TabsTrigger value="backup">{t("categories.backup")}</TabsTrigger>
          <TabsTrigger value="general">{t("categories.general")}</TabsTrigger>
          <TabsTrigger value="updates">{t("categories.updates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="apiKeys">
          <ApiKeysSection />
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
