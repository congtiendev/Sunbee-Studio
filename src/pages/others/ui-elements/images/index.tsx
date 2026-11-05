import { ComponentCard } from "@/components/shared/component-card";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import ResponsiveImage from "./components/responsive";
import ThreeColumnImageGrid from "./components/three-column-greed";
import TwoColumnImageGrid from "./components/two-column-grid";

export default function Images() {
  return (
    <>
      <PageMeta
        title="React.js Images Dashboard"
        description="This is React.js Images page for Sunbee Editor"
      />
      <PageBreadcrumb pageTitle="Images" />

      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Responsive image">
          <ResponsiveImage />
        </ComponentCard>
        <ComponentCard title="Image in 2 Grid">
          <TwoColumnImageGrid />
        </ComponentCard>
        <ComponentCard title="Image in 3 Grid">
          <ThreeColumnImageGrid />
        </ComponentCard>
      </div>
    </>
  );
}
