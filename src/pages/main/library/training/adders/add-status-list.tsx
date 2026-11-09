import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { CheckIcon } from "@/icons";
import type { AddStatus } from "./types";

/** Progress of a batch being added (links fetched, files transcribed…), one row per item. */
export default function AddStatusList({
  items,
}: {
  items: { label: string; status: AddStatus }[];
}) {
  const t = useTranslations("training.adders");
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1 rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-800">
      {items.map((item, i) => (
        <li key={`${i}-${item.label}`} className="flex items-start gap-2">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
            {item.status.state === "working" ? (
              <Spinner className="size-3.5" />
            ) : item.status.state === "done" ? (
              <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
            ) : item.status.state === "error" ? (
              <span className="text-red-500 dark:text-red-400">!</span>
            ) : (
              <span className="size-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-gray-700 dark:text-gray-300">
              {item.label}
            </span>
            <span
              className={
                item.status.state === "error"
                  ? "text-red-500 dark:text-red-400"
                  : "text-gray-500 dark:text-gray-400"
              }
            >
              {item.status.state === "error"
                ? item.status.message
                : t(`status.${item.status.state}`)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
