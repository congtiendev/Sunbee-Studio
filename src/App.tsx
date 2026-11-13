import AppLayout from "@/components/layout/app-layout";
import {
  RedirectIfAuthed,
  RequireAdmin,
  RequireAuth,
} from "@/components/shared/route-guards";
import DatabaseAdminPage from "@/pages/main/database-admin";
import CalendarPage from "@/pages/main/calendar";
import OverviewPage from "@/pages/main/dashboard/overview";
import FormElementsPage from "@/pages/main/forms/form-elements";
import { BlankPage, Error404Page } from "@/pages/main/pages";
import ProfilePage from "@/pages/main/profile";
import DocumentsPage from "@/pages/main/library/documents";
import MediaLibraryPage from "@/pages/main/library/media";
import SkillsPage from "@/pages/main/library/skills";
import SoundEffectsPage from "@/pages/main/library/sound-effects";
import TrainingPage from "@/pages/main/library/training";
import VoicesPage from "@/pages/main/library/voices";
import ProjectsPage from "@/pages/main/projects";
import ProjectDetailPage from "@/pages/main/projects/detail";
import SettingsPage from "@/pages/main/settings";
import StudioPage from "@/pages/main/studio";
import LegacyVideoStudioRedirect from "@/pages/main/studio/legacy-redirect";
import VideoRenderPage from "@/pages/main/video-render";
import BasicTablesPage from "@/pages/main/tables/basic-tables";
import { paths } from "@/lib/paths";
import { AuthLayout, SignInPage, SignUpPage } from "@/pages/others/auth";
import BarChartPage from "@/pages/others/charts/bar-chart";
import LineChartPage from "@/pages/others/charts/line-chart";
import Alerts from "@/pages/others/ui-elements/alerts";
import Avatars from "@/pages/others/ui-elements/avatars";
import Badges from "@/pages/others/ui-elements/badges";
import Buttons from "@/pages/others/ui-elements/buttons";
import Images from "@/pages/others/ui-elements/images";
import Videos from "@/pages/others/ui-elements/videos";
import "flatpickr/dist/flatpickr.css";
import { Navigate, Route, Routes } from "react-router";

export default function App() {
  return (
    <Routes>
      {/* Dashboard Layout */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />

        {/* Production */}
        <Route path={paths.projects} element={<ProjectsPage />} />
        <Route path={paths.projectDetail} element={<ProjectDetailPage />} />
        <Route path={paths.studio} element={<StudioPage />} />
        <Route path={paths.videoRender} element={<VideoRenderPage />} />

        {/* Library */}
        <Route path={paths.libraryMedia} element={<MediaLibraryPage />} />
        <Route path={paths.libraryDocuments} element={<DocumentsPage />} />
        <Route path={paths.librarySkills} element={<SkillsPage />} />
        <Route path={paths.libraryTraining} element={<TrainingPage />} />
        <Route path={paths.libraryVoices} element={<VoicesPage />} />
        <Route path={paths.librarySoundEffects} element={<SoundEffectsPage />} />

        {/* System */}
        <Route path={paths.settings} element={<SettingsPage />} />
        <Route
          path={paths.databaseAdmin}
          element={
            <RequireAdmin>
              <DatabaseAdminPage />
            </RequireAdmin>
          }
        />
        <Route path={paths.profile} element={<ProfilePage />} />

        {/* Pre-restructure URLs */}
        <Route path="/video-studio" element={<LegacyVideoStudioRedirect />} />
        <Route
          path="/video-studio/projects"
          element={<Navigate to={paths.projects} replace />}
        />
        <Route
          path="/video-studio/categories"
          element={<Navigate to={paths.projects} replace />}
        />
        <Route
          path="/video-studio/assets"
          element={<Navigate to={paths.libraryMedia} replace />}
        />
        <Route
          path="/video-studio/documents"
          element={<Navigate to={paths.libraryDocuments} replace />}
        />
        <Route
          path="/video-studio/skills"
          element={<Navigate to={paths.librarySkills} replace />}
        />

        {/* Template demos (listed in the sidebar in dev builds only) */}
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/blank" element={<BlankPage />} />

        {/* Forms */}
        <Route path="/form-elements" element={<FormElementsPage />} />

        {/* Tables */}
        <Route path="/basic-tables" element={<BasicTablesPage />} />

        {/* Ui Elements */}
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/avatars" element={<Avatars />} />
        <Route path="/badge" element={<Badges />} />
        <Route path="/buttons" element={<Buttons />} />
        <Route path="/images" element={<Images />} />
        <Route path="/videos" element={<Videos />} />

        {/* Charts */}
        <Route path="/line-chart" element={<LineChartPage />} />
        <Route path="/bar-chart" element={<BarChartPage />} />
      </Route>

      {/* Auth Layout */}
      <Route
        element={
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        }
      >
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
      </Route>

      {/* Full-width / Error / Status Pages */}
      <Route path="/error-404" element={<Error404Page />} />

      {/* Fallback Route */}
      <Route path="*" element={<Error404Page />} />
    </Routes>
  );
}
