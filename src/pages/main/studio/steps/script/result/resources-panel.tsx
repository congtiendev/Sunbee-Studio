import { useTranslations } from "@/i18n";
import type { ScriptResources } from "@shared/types";

export default function ResourcesPanel({ resources }: { resources: ScriptResources }) {
  const t = useTranslations("videoStudio.script");

  return (
    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <li>
        <strong>{t("shotCount")}:</strong> {resources.shotCount}
      </li>
      <li>
        <strong>{t("voiceover")}:</strong> {resources.voiceover}
      </li>
      <li>
        <strong>{t("music")}:</strong> {resources.music}
      </li>
      <li>
        <strong>{t("images")}:</strong> {resources.images.join(", ")}
      </li>
      <li>
        <strong>{t("notes")}:</strong> {resources.notes}
      </li>
    </ul>
  );
}
