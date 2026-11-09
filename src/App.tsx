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
import SettingsPage from "@/pages/main/settings";
import BasicTablesPage from "@/pages/main/tables/basic-tables";
import VideoStudioPage from "@/pages/main/video-studio";
import VideoStudioCategoriesPage from "@/pages/main/video-studio/categories";
import VideoStudioAssetLibraryPage from "@/pages/main/video-studio/asset-library";
import VideoStudioDocumentsPage from "@/pages/main/video-studio/documents";
import VideoStudioProjectsPage from "@/pages/main/video-studio/projects";
import VideoStudioSkillsPage from "@/pages/main/video-studio/skills";
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
import { Route, Routes } from "react-router";

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

        {/* Others Page */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/video-studio" element={<VideoStudioPage />} />
        <Route path="/video-studio/projects" element={<VideoStudioProjectsPage />} />
        <Route path="/video-studio/categories" element={<VideoStudioCategoriesPage />} />
        <Route path="/video-studio/skills" element={<VideoStudioSkillsPage />} />
        <Route path="/video-studio/documents" element={<VideoStudioDocumentsPage />} />
        <Route path="/video-studio/assets" element={<VideoStudioAssetLibraryPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/blank" element={<BlankPage />} />
        <Route
          path="/database-admin"
          element={
            <RequireAdmin>
              <DatabaseAdminPage />
            </RequireAdmin>
          }
        />

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
