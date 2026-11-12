import type { AnalyzeProvider } from "@shared/script-cost-estimate";
import EffortField, { type AiEffort } from "./effort-field";
import ProviderModelFields from "./provider-model-fields";

/** Provider + model + effort, every place an AI action lets the user pick what runs it. */
export default function AiSettingsFields({
  providerLabel,
  provider,
  onProviderChange,
  model,
  onModelChange,
  availableProviders,
  effort,
  onEffortChange,
}: {
  providerLabel: string;
  provider: AnalyzeProvider;
  onProviderChange: (provider: AnalyzeProvider) => void;
  model: string;
  onModelChange: (model: string) => void;
  availableProviders: Record<AnalyzeProvider, boolean>;
  effort: AiEffort;
  onEffortChange: (effort: AiEffort) => void;
}) {
  return (
    <>
      <ProviderModelFields
        providerLabel={providerLabel}
        provider={provider}
        onProviderChange={onProviderChange}
        model={model}
        onModelChange={onModelChange}
        availableProviders={availableProviders}
      />
      <EffortField value={effort} onChange={onEffortChange} />
    </>
  );
}
