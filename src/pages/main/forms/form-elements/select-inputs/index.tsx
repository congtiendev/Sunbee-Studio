import { ComponentCard } from "@/components/shared/component-card";
import ComboboxSelectInput from "@/pages/main/forms/form-elements/select-inputs/combobox-select-input";
import MultipleSelectInput from "@/pages/main/forms/form-elements/select-inputs/multiple-select-input";
import SelectInput from "@/pages/main/forms/form-elements/select-inputs/select-input";

export default function SelectInputs() {
  return (
    <ComponentCard title="Select Inputs">
      <div className="space-y-6">
        <SelectInput />
        <MultipleSelectInput />
        <ComboboxSelectInput />
      </div>
    </ComponentCard>
  );
}
