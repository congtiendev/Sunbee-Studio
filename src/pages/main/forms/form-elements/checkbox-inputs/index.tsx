import { ComponentCard } from "@/components/shared/component-card";
import DefaultCheckbox from "@/pages/main/forms/form-elements/checkbox-inputs/default-checkbox";
import LabeledCheckbox from "@/pages/main/forms/form-elements/checkbox-inputs/labeled-checkbox";

export default function CheckboxInputs() {
  return (
    <ComponentCard title="Checkboxes">
      <div className="space-y-6">
        <DefaultCheckbox />
        <LabeledCheckbox />
      </div>
    </ComponentCard>
  );
}
