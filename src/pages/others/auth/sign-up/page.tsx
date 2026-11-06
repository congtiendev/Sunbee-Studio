import { PageMeta } from "@/components/shared/page-meta";
import SignUp from "@/pages/others/auth/sign-up/index";

export default function SignUpPage() {
  return (
    <>
      <PageMeta
        title="React.js SignUp Dashboard"
        description="This is React.js SignUp Tables Dashboard page for Sunbee Studio"
      />
      <SignUp />
    </>
  );
}
