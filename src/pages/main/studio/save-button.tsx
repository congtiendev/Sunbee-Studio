import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { CheckIcon, FloppyDiscIcon } from "@/icons";
import type { StepSaveHandle } from "./steps/step-save";

/**
 * The studio's Save button for the open step, with its state underneath:
 * unsaved changes / saved at … A step without anything to save shows "Saved".
 */
export default function SaveButton({
  handle,
  disabled,
  onSave,
}: {
  handle: StepSaveHandle | null;
  disabled?: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("videoStudio.navigation");
  const dirty = Boolean(handle?.dirty);
  const saving = Boolean(handle?.saving);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Button
        type="button"
        variant={dirty ? "default" : "outline"}
        disabled={disabled || saving || !dirty}
        onClick={onSave}
        title={t("saveShortcut")}
        className="gap-1.5"
      >
        {saving ? (
          <Spinner />
        ) : dirty ? (
          <FloppyDiscIcon className="size-4" />
        ) : (
          <CheckIcon className="size-4" />
        )}
        {t(saving ? "saving" : dirty ? "save" : "saved")}
      </Button>
      <span
        className={
          dirty
            ? "text-[11px] text-amber-600 dark:text-amber-400"
            : "text-[11px] text-gray-500 dark:text-gray-400"
        }
      >
        {dirty
          ? t("unsaved")
          : handle?.savedAt
            ? t("savedAt", { time: handle.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
            : t("autoSaved")}
      </span>
    </div>
  );
}
