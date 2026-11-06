import { ComponentCard } from "@/components/shared/component-card";
import DefaultRadioButtons from "@/pages/main/forms/form-elements/radio-buttons/default-radio-buttons";
import LabeledRadioButtons from "@/pages/main/forms/form-elements/radio-buttons/labeled-radio-buttons";

export default function RadioButtons() {
  return (
    <ComponentCard title="Radio Buttons">
      <div className="space-y-6">
        <DefaultRadioButtons />
        <LabeledRadioButtons />
      </div>
    </ComponentCard>
  );
}
