import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { useTranslations } from "@/i18n";
import { HorizontalDotsIcon } from "@/icons";
import { cn } from "@/utils";
import SidebarMenuItem from "@/components/layout/app-layout/sidebar/sidebar-menu-item";
import type {
  NavSection,
  OpenSubmenu,
} from "@/components/layout/app-layout/sidebar/types";

interface SidebarNavGroupProps {
  section: NavSection;
  openSubmenu: OpenSubmenu | null;
  showContent: boolean;
  pathname: string;
  onToggleSubmenu: (section: string, index: number) => void;
}

export default function SidebarNavGroup({
  section,
  openSubmenu,
  showContent,
  pathname,
  onToggleSubmenu,
}: SidebarNavGroupProps) {
  const t = useTranslations("sidebar");

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel
        className={cn(
          "mb-4 flex h-auto p-0 text-xs leading-5 text-gray-400 uppercase",
          !showContent ? "xl:justify-center" : "justify-start",
        )}
      >
        {showContent ? t(`groups.${section.key}`) : <HorizontalDotsIcon />}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {section.items.map((nav, index) => (
          <SidebarMenuItem
            key={nav.key}
            nav={nav}
            isOpen={
              openSubmenu?.section === section.key &&
              openSubmenu.index === index
            }
            showContent={showContent}
            pathname={pathname}
            onToggle={() => onToggleSubmenu(section.key, index)}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
