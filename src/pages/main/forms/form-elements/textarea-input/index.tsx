import { ComponentCard } from "@/components/shared/component-card";
import DefaultTextarea from "@/pages/main/forms/form-elements/textarea-input/default-textarea";
import DisabledTextarea from "@/pages/main/forms/form-elements/textarea-input/disabled-textarea";
import ErrorTextarea from "@/pages/main/forms/form-elements/textarea-input/error-textarea";
import InputGroupTextareaExample from "@/pages/main/forms/form-elements/textarea-input/input-group-textarea";

export default function TextAreaInput() {
  return (
    <ComponentCard title="Textarea input field">
      <div className="space-y-6">
        <DefaultTextarea />
        <DisabledTextarea />
        <ErrorTextarea />
        <InputGroupTextareaExample />
      </div>
    </ComponentCard>
  );
}
