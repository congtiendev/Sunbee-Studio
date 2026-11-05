import { ComponentCard } from "@/components/shared/component-card";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import DefaultAlert from "./components/default-alert";
import ErrorAlert from "./components/error-alert";
import InfoAlert from "./components/info-alert";
import SuccessAlert from "./components/success-alert";
import WarningAlert from "./components/warning-alert";

export default function Alerts() {
  return (
    <>
      <PageMeta
        title="React.js Alerts Dashboard"
        description="This is React.js Alerts Dashboard page for Sunbee Editor"
      />
      <PageBreadcrumb pageTitle="Alerts" />

      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Default Alert">
          <DefaultAlert />
        </ComponentCard>
        <ComponentCard title="Success Alert">
          <SuccessAlert />
        </ComponentCard>
        <ComponentCard title="Warning Alert">
          <WarningAlert />
        </ComponentCard>
        <ComponentCard title="Error Alert">
          <ErrorAlert />
        </ComponentCard>
        <ComponentCard title="Info Alert">
          <InfoAlert />
        </ComponentCard>
      </div>
    </>
  );
}
