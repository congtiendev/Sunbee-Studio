import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useTranslations } from "@/i18n";

/** Previous/next footer for an admin table page — shared by the data-heavy sections. */
export default function TablePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("databaseAdmin.pagination");

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {t("pageOf", { current: page, total: totalPages })}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="gap-1.5">
          <PaginationItem>
            <PaginationPrevious
              href="#"
              size="sm"
              variant="outline"
              text={t("previous")}
              disabled={page <= 1}
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) onPageChange(page - 1);
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              size="sm"
              variant="outline"
              text={t("next")}
              disabled={page >= totalPages}
              onClick={(e) => {
                e.preventDefault();
                if (page < totalPages) onPageChange(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
