import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import BlankPageContent from "./index";

export default function BlankPage() {
  return (
    <div>
      <PageMeta
        title="React.js Blank Page"
        description="This is React.js Blank Page for Sunbee Editor"
      />
      <PageBreadcrumb pageTitle="Blank Page" />
      <BlankPageContent />
    </div>
  );
}
