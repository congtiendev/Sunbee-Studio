import { PageMeta } from "@/components/shared/page-meta";
import Error404 from "@/pages/main/pages/error-404/index";

export default function Error404Page() {
  return (
    <div>
      <PageMeta
        title="React.js 404 Page"
        description="This is React.js 404  page for Sunbee Studio"
      />
      <Error404 />
    </div>
  );
}
