import { useTranslations } from "@/i18n";

/** Body for a step that has a module but no implementation yet. */
export default function ComingSoonStep() {
  const t = useTranslations("videoStudio");
  return (
    <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
      {t("comingSoon")}
    </div>
  );
}
