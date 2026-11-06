import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import CheckboxInputs from "@/pages/main/forms/form-elements/checkbox-inputs";
import DefaultInputs from "@/pages/main/forms/form-elements/default-inputs";
import Dropzone from "@/pages/main/forms/form-elements/dropzone";
import FileInput from "@/pages/main/forms/form-elements/file-input";
import InputGroup from "@/pages/main/forms/form-elements/input-group";
import InputStates from "@/pages/main/forms/form-elements/input-states";
import RadioButtons from "@/pages/main/forms/form-elements/radio-buttons";
import SelectInputs from "@/pages/main/forms/form-elements/select-inputs";
import TextAreaInput from "@/pages/main/forms/form-elements/textarea-input";
import ToggleSwitch from "@/pages/main/forms/form-elements/toggle-switch";

export default function FormElementsPage() {
  return (
    <div>
      <PageMeta
        title="React.js Form Elements Dashboard"
        description="This is React.js Form Elements  Dashboard page for Sunbee Studio"
      />
      <PageBreadcrumb pageTitle="Form Elements" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <DefaultInputs />
          <SelectInputs />
          <TextAreaInput />
          <InputStates />
        </div>
        <div className="space-y-6">
          <InputGroup />
          <FileInput />
          <CheckboxInputs />
          <RadioButtons />
          <ToggleSwitch />
          <Dropzone />
        </div>
      </div>
    </div>
  );
}
