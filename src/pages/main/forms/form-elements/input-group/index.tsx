import { ComponentCard } from "@/components/shared/component-card";
import CopyInput from "@/pages/main/forms/form-elements/input-group/copy-input";
import EmailInput from "@/pages/main/forms/form-elements/input-group/email-input";
import PhoneInputEnd from "@/pages/main/forms/form-elements/input-group/phone-input-end";
import PhoneInputStart from "@/pages/main/forms/form-elements/input-group/phone-input-start";
import UrlInput from "@/pages/main/forms/form-elements/input-group/url-input";

export default function InputGroup() {
  return (
    <ComponentCard title="Input Group">
      <div className="space-y-6">
        <EmailInput />
        <PhoneInputStart />
        <PhoneInputEnd />
        <UrlInput />
        <CopyInput />
      </div>
    </ComponentCard>
  );
}
