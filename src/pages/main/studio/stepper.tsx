import { CheckIcon, type IconProps } from "@/icons";
import { cn } from "@/utils";
import type { ComponentType } from "react";

interface StepperStep {
  key: string;
  label: string;
  hint: string;
  icon: ComponentType<IconProps>;
}

interface StepperProps {
  steps: StepperStep[];
  activeIndex: number;
  furthestIndex: number;
  /** Steps actually finished (see `onComplete`) — what earns the checkmark; merely having been visited does not. */
  completedKeys: ReadonlySet<string>;
  onStepClick: (index: number) => void;
  /** Blocks every step button (e.g. a long-running AI call on the active step). */
  disabled?: boolean;
}

export default function Stepper({
  steps,
  activeIndex,
  furthestIndex,
  completedKeys,
  onStepClick,
  disabled = false,
}: StepperProps) {
  const progress =
    steps.length > 1 ? (furthestIndex / (steps.length - 1)) * 100 : 0;

  return (
    <div>
      <ol
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
      >
        <span
          aria-hidden="true"
          className="absolute top-[18px] right-0 left-0 h-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
          style={{
            marginInline: `calc(100% / ${steps.length} / 2)`,
          }}
        />
        <span
          aria-hidden="true"
          className="absolute start-0 top-[18px] h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500 ease-out rtl:bg-gradient-to-l"
          style={{
            marginInlineStart: `calc(100% / ${steps.length} / 2)`,
            width:
              steps.length > 1
                ? `calc((100% - 100% / ${steps.length}) * ${progress / 100})`
                : "0%",
          }}
        />

        {steps.map((step, index) => {
          const isCompleted = completedKeys.has(step.key);
          const isCurrent = index === activeIndex;
          const Icon = step.icon;

          return (
            <li key={step.key} className="relative flex justify-center">
              {/* The whole step — circle and label — is one button; any step can be opened. */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onStepClick(index)}
                aria-current={isCurrent ? "step" : undefined}
                className="group flex flex-col items-center gap-1.5 rounded-xl px-1 pb-1 outline-none focus-visible:ring-3 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-white text-gray-400 transition-all duration-300 dark:bg-gray-900 dark:text-gray-500",
                    isCompleted &&
                      "border-brand-500 bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-theme-xs group-enabled:group-hover:from-brand-600 group-enabled:group-hover:to-brand-600",
                    isCurrent &&
                      !isCompleted &&
                      "border-brand-500 text-brand-500 ring-4 ring-brand-500/15 dark:text-brand-400",
                    !isCompleted &&
                      !isCurrent &&
                      "border-gray-200 group-enabled:group-hover:border-brand-300 group-enabled:group-hover:text-brand-500 dark:border-gray-700 dark:group-enabled:group-hover:border-brand-500/50 dark:group-enabled:group-hover:text-brand-400",
                  )}
                >
                  {isCompleted ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}

                  {isCurrent && !isCompleted && (
                    <span className="absolute -end-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-white dark:bg-gray-900">
                      <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
                    </span>
                  )}
                </span>

                <span className="flex flex-col items-center gap-0.5 text-center">
                  <span
                    className={cn(
                      "text-xs font-semibold transition-colors",
                      isCurrent || isCompleted
                        ? "text-gray-800 dark:text-white/90"
                        : "text-gray-400 group-enabled:group-hover:text-gray-600 dark:text-gray-500 dark:group-enabled:group-hover:text-gray-300",
                    )}
                  >
                    {step.label}
                  </span>
                  <span
                    className={cn(
                      "hidden text-[11px] transition-colors sm:block",
                      isCurrent
                        ? "text-brand-500 dark:text-brand-400"
                        : "text-gray-400 dark:text-gray-500",
                    )}
                  >
                    {step.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
