import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts";
import { useState } from "react";
import { useLocation } from "react-router";
import { navSections } from "@/components/layout/app-layout/sidebar/data";
import AppSidebarHeader from "@/components/layout/app-layout/sidebar/sidebar-header";
import SidebarNavGroup from "@/components/layout/app-layout/sidebar/sidebar-nav-group";
import {
  isNavPathActive,
  type NavSection,
  type OpenSubmenu,
} from "@/components/layout/app-layout/sidebar/types";

/** The sections this user can see: admin-only items dropped, then empty sections. */
function visibleSections(isAdmin: boolean): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAdmin || !item.adminOnly),
    }))
    .filter((section) => section.items.length > 0);
}

function findOpenSubmenu(
  sections: NavSection[],
  pathname: string,
): OpenSubmenu | null {
  for (const section of sections) {
    const index = section.items.findIndex((nav) =>
      nav.subItems?.some((subItem) => isNavPathActive(subItem, pathname)),
    );
    if (index !== -1) return { section: section.key, index };
  }
  return null;
}

export default function AppSidebar() {
  const { open, isMobile } = useSidebar();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const showContent = open || isMobile;
  const sections = visibleSections(user?.role === "admin");

  const [openSubmenu, setOpenSubmenu] = useState<OpenSubmenu | null>(() =>
    findOpenSubmenu(sections, pathname),
  );

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenSubmenu(findOpenSubmenu(sections, pathname));
  }

  const handleSubmenuToggle = (section: string, index: number) => {
    setOpenSubmenu((prev) =>
      prev && prev.section === section && prev.index === index
        ? null
        : { section, index },
    );
  };

  return (
    <Sidebar side="left" collapsible="icon">
      <AppSidebarHeader showContent={showContent} />

      <SidebarContent className="overflow-y-auto px-5 duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {sections.map((section) => (
              <SidebarNavGroup
                key={section.key}
                section={section}
                openSubmenu={openSubmenu}
                showContent={showContent}
                pathname={pathname}
                onToggleSubmenu={handleSubmenuToggle}
              />
            ))}
          </div>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
