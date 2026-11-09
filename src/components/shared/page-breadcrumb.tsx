import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTranslations } from "@/i18n";
import { Fragment } from "react";

export interface BreadcrumbTrailItem {
  label: string;
  /** Omit for an item that is shown but not linked. */
  to?: string;
}

interface BreadcrumbProps {
  pageTitle: string;
  /** Ancestors between Home and the current page, outermost first. */
  trail?: BreadcrumbTrailItem[];
  actions?: React.ReactNode;
}

export function PageBreadcrumb({
  pageTitle,
  trail = [],
  actions,
}: BreadcrumbProps) {
  const tCommon = useTranslations("common");

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 truncate text-title-lg font-semibold text-gray-800 dark:text-white/90">
        {pageTitle}
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink to="/">{tCommon("home")}</BreadcrumbLink>
            </BreadcrumbItem>
            {trail.map((item, index) => (
              <Fragment key={`${index}-${item.label}`}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {item.to ? (
                    <BreadcrumbLink to={item.to}>{item.label}</BreadcrumbLink>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}
