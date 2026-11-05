import { PageMeta } from "@/components/shared/page-meta";
import Error404 from "./index";

export default function Error404Page() {
  return (
    <div>
      <PageMeta
        title="React.js 404 Page"
        description="This is React.js 404  page for Sunbee Editor"
      />
      <Error404 />
    </div>
  );
}
