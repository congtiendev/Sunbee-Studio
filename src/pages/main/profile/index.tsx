import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import AddressSection from "@/pages/main/profile/address";
import DangerZone from "@/pages/main/profile/danger";
import PersonalInformationSection from "@/pages/main/profile/personal-information";
import SecuritySection from "@/pages/main/profile/security";

export default function ProfilePage() {
  return (
    <div>
      <PageMeta
        title="React.js Profile Dashboard"
        description="This is React.js Profile Dashboard page for Sunbee Studio"
      />
      <PageBreadcrumb pageTitle="Profile" />
      <div className="card-surface p-5 lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 lg:mb-7 dark:text-white/90">
          Profile
        </h3>
        <div className="space-y-6">
          <PersonalInformationSection />
          <AddressSection />
          <SecuritySection />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}
