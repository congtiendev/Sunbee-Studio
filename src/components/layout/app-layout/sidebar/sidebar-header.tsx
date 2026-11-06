import { SidebarHeader } from "@/components/ui/sidebar";
import { Link } from "react-router";

interface AppSidebarHeaderProps {
  showContent: boolean;
}

export default function AppSidebarHeader({
  showContent,
}: AppSidebarHeaderProps) {
  return (
    <SidebarHeader className="px-5 py-8">
      <Link to="/">
        {showContent ? (
          <>
            <img
              className="h-10 w-auto dark:hidden"
              src="/images/logo/logo.png"
              alt="Logo"
            />
            <img
              className="hidden h-10 w-auto dark:block"
              src="/images/logo/logo-dark.png"
              alt="Logo"
            />
          </>
        ) : (
          <img src="/images/logo/logo-icon.png" alt="Logo" className="size-8" />
        )}
      </Link>
    </SidebarHeader>
  );
}
