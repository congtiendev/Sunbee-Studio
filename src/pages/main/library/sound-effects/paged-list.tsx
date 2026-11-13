import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { useState, type ReactNode } from "react";

const PAGE_SIZE = 40;

/**
 * Renders the first page of a long list and a "show more" button for the
 * rest. Key it by the active filter so it starts from the first page again.
 */
export function PagedList<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const t = useTranslations("soundEffects");
  const [shown, setShown] = useState(PAGE_SIZE);
  const remaining = items.length - shown;

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2 2xl:grid-cols-3">{items.slice(0, shown).map(render)}</div>
      {remaining > 0 && (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            {t("showMore", { count: remaining })}
          </Button>
        </div>
      )}
    </>
  );
}
