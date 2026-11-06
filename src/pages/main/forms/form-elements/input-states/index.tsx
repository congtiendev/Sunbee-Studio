import { ComponentCard } from "@/components/shared/component-card";
import DisabledInput from "@/pages/main/forms/form-elements/input-states/disabled-input";
import ErrorInput from "@/pages/main/forms/form-elements/input-states/error-input";
import SuccessInput from "@/pages/main/forms/form-elements/input-states/success-input";

export default function InputStates() {
  return (
    <ComponentCard
      title="Input States"
      description="Validation styles for error, success and disabled states on form controls."
    >
      <div className="space-y-6">
        <ErrorInput />
        <SuccessInput />
        <DisabledInput />
      </div>
    </ComponentCard>
  );
}
