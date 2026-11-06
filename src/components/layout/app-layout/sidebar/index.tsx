import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts";
import { useState } from "react";
import { useLocation } from "react-router";
import { navItems, othersItems, supportItems } from "@/components/layout/app-layout/sidebar/data";
import AppSidebarHeader from "@/components/layout/app-layout/sidebar/sidebar-header";
import SidebarNavGroup from "@/components/layout/app-layout/sidebar/sidebar-nav-group";
import type { MenuType, NavItem } from "@/components/layout/app-layout/sidebar/types";

function buildMenuSections(
  isAdmin: boolean,
): { type: MenuType; labelKey: string; items: NavItem[] }[] {
  const filterAdminOnly = (items: NavItem[]) =>
    isAdmin ? items : items.filter((item) => !item.adminOnly);

  return [
    { type: "main", labelKey: "groups.menu", items: filterAdminOnly(navItems) },
    { type: "support", labelKey: "groups.support", items: supportItems },
    { type: "others", labelKey: "groups.others", items: othersItems },
  ];
}

const findMatchingSubmenu = (
  menuSections: { type: MenuType; labelKey: string; items: NavItem[] }[],
  path: string,
) => {
  for (const section of menuSections) {
    for (let index = 0; index < section.items.length; index++) {
      const nav = section.items[index];
      if (
        nav.subItems?.some(
          (subItem) =>
            subItem.path === path ||
            (subItem.path === "/ai-settings" &&
              path.startsWith("/ai-settings")),
        )
      ) {
        return { type: section.type, index };
      }
    }
  }
  return null;
};

export default function AppSidebar() {
  const { open, isMobile } = useSidebar();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const showContent = open || isMobile;

  const menuSections = buildMenuSections(user?.role === "admin");

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: MenuType;
    index: number;
  } | null>(() => findMatchingSubmenu(menuSections, pathname));

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenSubmenu(findMatchingSubmenu(menuSections, pathname));
  }

  const handleSubmenuToggle = (index: number, menuType: MenuType) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const activeSections = menuSections.filter(
    (section) => section.items.length > 0,
  );

  return (
    <Sidebar side="left" collapsible="icon">
      <AppSidebarHeader showContent={showContent} />

      <SidebarContent className="overflow-y-auto px-5 duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {activeSections.map((section) => (
              <SidebarNavGroup
                key={section.type}
                labelKey={section.labelKey}
                menuType={section.type}
                items={section.items}
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
