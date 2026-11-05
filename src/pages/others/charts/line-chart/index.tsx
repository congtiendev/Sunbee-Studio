import { ComponentCard } from "@/components/shared/component-card";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import LineChartOne from "./components/one";

export default function LineChartPage() {
  return (
    <div>
      <PageMeta
        title="React.js Chart Dashboard"
        description="This is React.js Chart Dashboard page for Sunbee Editor"
      />
      <PageBreadcrumb pageTitle="Line Chart" />
      <div className="space-y-6 overflow-x-hidden">
        <ComponentCard title="Line Chart 1">
          <LineChartOne />
        </ComponentCard>
      </div>
    </div>
  );
}
