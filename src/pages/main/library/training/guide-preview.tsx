import { cn } from "@/utils";

/** A skill's instructions as written (markdown-ish headings and bullets), scrollable. */
export default function GuidePreview({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "custom-scrollbar max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300",
        className,
      )}
    >
      {text}
    </div>
  );
}
