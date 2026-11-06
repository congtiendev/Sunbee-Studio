import { ComponentCard } from "@/components/shared/component-card";
import BasicInput from "@/pages/main/forms/form-elements/default-inputs/basic-input";
import DatePickerInput from "@/pages/main/forms/form-elements/default-inputs/date-picker-input";
import InputWithPlaceholder from "@/pages/main/forms/form-elements/default-inputs/input-with-placeholder";
import PasswordInput from "@/pages/main/forms/form-elements/default-inputs/password-input";
import PaymentInput from "@/pages/main/forms/form-elements/default-inputs/payment-input";
import SelectInput from "@/pages/main/forms/form-elements/default-inputs/select-input";
import TimeSelectInput from "@/pages/main/forms/form-elements/default-inputs/time-select-input";

export default function DefaultInputs() {
  return (
    <ComponentCard title="Default Inputs">
      <div className="space-y-6">
        <BasicInput />
        <InputWithPlaceholder />
        <SelectInput />
        <PasswordInput />
        <DatePickerInput />
        <TimeSelectInput />
        <PaymentInput />
      </div>
    </ComponentCard>
  );
}
