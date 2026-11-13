import {
  BoxIcon,
  BrainIcon,
  DatabaseIcon,
  DocIcon,
  FolderIcon,
  GearIcon,
  LayoutGridIcon,
  SoundIcon,
  SparkIcon,
  UploadIcon,
} from "@/icons";
import type { NavSection } from "@/components/layout/app-layout/sidebar/types";
import { paths } from "@/lib/paths";

/**
 * The sidebar, section by section. Labels: `sidebar.groups.<section key>` and
 * `sidebar.items.<item key>` in both message files. Sections with no visible
 * items (e.g. admin-only) are hidden automatically.
 */
export const navSections: NavSection[] = [
  {
    key: "production",
    items: [
      {
        icon: <LayoutGridIcon className="size-6" />,
        key: "dashboard",
        path: paths.overview,
      },
      {
        icon: <FolderIcon className="size-6" />,
        key: "projects",
        path: paths.projects,
        // A project's detail page and the video studio live under Projects.
        activePaths: [paths.projectDetail, paths.studio],
      },
    ],
  },
  {
    key: "library",
    items: [
      {
        icon: <UploadIcon className="size-6" />,
        key: "mediaLibrary",
        path: paths.libraryMedia,
      },
      {
        icon: <DocIcon className="size-6" />,
        key: "documents",
        path: paths.libraryDocuments,
      },
      {
        icon: <SparkIcon className="size-6" />,
        key: "skills",
        path: paths.librarySkills,
      },
      {
        icon: <BrainIcon className="size-6" />,
        key: "training",
        path: paths.libraryTraining,
      },
      {
        icon: <SoundIcon className="size-6" />,
        key: "soundEffects",
        path: paths.librarySoundEffects,
      },
    ],
  },
  {
    key: "system",
    items: [
      {
        icon: <GearIcon className="size-6" />,
        key: "settings",
        path: paths.settings,
      },
      {
        icon: <DatabaseIcon className="size-6" />,
        key: "databaseAdmin",
        path: paths.databaseAdmin,
        adminOnly: true,
      },
    ],
  },
  // Template demo pages stay routable but only show up while developing.
  ...(import.meta.env.DEV
    ? [
        {
          key: "dev",
          items: [
            {
              key: "templateDemos",
              icon: <BoxIcon className="size-6" />,
              subItems: [
                { key: "userProfile", path: "/profile" },
                { key: "calendar", path: "/calendar" },
                { key: "formElements", path: "/form-elements" },
                { key: "basicTables", path: "/basic-tables" },
                { key: "blankPage", path: "/blank" },
                { key: "error404", path: "/error-404" },
                { key: "lineChart", path: "/line-chart" },
                { key: "barChart", path: "/bar-chart" },
                { key: "alerts", path: "/alerts" },
                { key: "avatar", path: "/avatars" },
                { key: "badge", path: "/badge" },
                { key: "buttons", path: "/buttons" },
                { key: "images", path: "/images" },
                { key: "videos", path: "/videos" },
                { key: "signIn", path: "/signin" },
                { key: "signUp", path: "/signup" },
              ],
            },
          ],
        },
      ]
    : []),
];
