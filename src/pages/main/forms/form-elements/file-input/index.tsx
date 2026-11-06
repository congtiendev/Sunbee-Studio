import { ComponentCard } from "@/components/shared/component-card";
import DefaultFileInput from "@/pages/main/forms/form-elements/file-input/default-file-input";

export default function FileInput() {
  return (
    <ComponentCard title="File Input">
      <div className="space-y-6">
        <DefaultFileInput />
      </div>
    </ComponentCard>
  );
}
