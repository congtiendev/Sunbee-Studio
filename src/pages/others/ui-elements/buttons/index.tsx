import { ComponentCard } from "@/components/shared/component-card";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import ButtonGroupDemo from "@/pages/others/ui-elements/buttons/components/button-group";
import ButtonSizes from "@/pages/others/ui-elements/buttons/components/sizes";
import ButtonVariants from "@/pages/others/ui-elements/buttons/components/variants";
import ButtonsWithIcon from "@/pages/others/ui-elements/buttons/components/with-icon";

export default function Buttons() {
  return (
    <div>
      <PageMeta
        title="React.js Buttons Dashboard"
        description="This is React.js Buttons Dashboard page for Sunbee Studio"
      />

      <PageBreadcrumb pageTitle="Buttons" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Button Variants">
          <ButtonVariants />
        </ComponentCard>
        <ComponentCard title="Button Sizes">
          <ButtonSizes />
        </ComponentCard>
        <ComponentCard title="Button with Icon">
          <ButtonsWithIcon />
        </ComponentCard>
        <ComponentCard title="Button Group">
          <ButtonGroupDemo />
        </ComponentCard>
      </div>
    </div>
  );
}
