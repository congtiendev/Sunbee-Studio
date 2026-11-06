import {
  BoxIcon,
  CameraIcon,
  DatabaseIcon,
  GearIcon,
  LayoutGridIcon,
} from "@/icons";
import type { NavItem } from "@/components/layout/app-layout/sidebar/types";

export const navItems: NavItem[] = [
  {
    icon: <LayoutGridIcon className="size-6" />,
    key: "dashboard",
    path: "/",
  },
  {
    icon: <CameraIcon className="size-6" />,
    key: "videoStudio",
    subItems: [
      { key: "videoStudioCreate", path: "/video-studio" },
      { key: "videoStudioProjects", path: "/video-studio/projects" },
      { key: "videoStudioCategories", path: "/video-studio/categories" },
    ],
  },
  {
    icon: <GearIcon className="size-6" />,
    key: "settings",
    path: "/settings",
  },
  {
    icon: <DatabaseIcon className="size-6" />,
    key: "databaseAdmin",
    path: "/database-admin",
    adminOnly: true,
  },
  {
    key: "templateDemos",
    icon: <BoxIcon className="size-6" />,
    subItems: [
      { key: "userProfile", path: "/profile" },
      { key: "calendar", path: "/calendar" },
      { key: "formElements", path: "/form-elements", pro: false },
      { key: "basicTables", path: "/basic-tables", pro: false },
      { key: "blankPage", path: "/blank" },
      { key: "error404", path: "/error-404" },
      { key: "lineChart", path: "/line-chart", pro: false },
      { key: "barChart", path: "/bar-chart", pro: false },
      { key: "alerts", path: "/alerts" },
      { key: "avatar", path: "/avatars" },
      { key: "badge", path: "/badge" },
      { key: "buttons", path: "/buttons" },
      { key: "images", path: "/images" },
      { key: "videos", path: "/videos" },
      { key: "signIn", path: "/signin", pro: false },
      { key: "signUp", path: "/signup", pro: false },
    ],
  },
];

export const othersItems: NavItem[] = [];

export const supportItems: NavItem[] = [];
