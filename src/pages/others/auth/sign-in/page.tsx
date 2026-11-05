import { PageMeta } from "@/components/shared/page-meta";
import SignIn from "./index";

export default function SignInPage() {
  return (
    <>
      <PageMeta
        title="React.js SignIn Dashboard"
        description="This is React.js SignIn Tables Dashboard page for Sunbee Editor"
      />
      <SignIn />
    </>
  );
}
