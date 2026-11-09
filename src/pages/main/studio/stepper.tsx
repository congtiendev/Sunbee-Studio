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
  onStepClick: (index: number) => void;
}

export default function Stepper({
  steps,
  activeIndex,
  furthestIndex,
  onStepClick,
}: StepperProps) {
  const progress =
    steps.length > 1 ? (furthestIndex / (steps.length - 1)) * 100 : 0;

  return (
    <div>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        <span
          aria-hidden="true"
          className="absolute top-[18px] right-0 left-0 h-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
          style={{
            marginInline: `calc(100% / ${steps.length} / 2)`,
          }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[18px] start-0 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500 ease-out rtl:bg-gradient-to-l"
          style={{
            marginInlineStart: `calc(100% / ${steps.length} / 2)`,
            width:
              steps.length > 1
                ? `calc((100% - 100% / ${steps.length}) * ${progress / 100})`
                : "0%",
          }}
        />

        {steps.map((step, index) => {
          const isCompleted = index < furthestIndex;
          const isCurrent = index === activeIndex;
          const isReachable = index <= furthestIndex;
          const Icon = step.icon;

          return (
            <li
              key={step.key}
              className="relative flex flex-col items-center gap-1.5"
            >
              <button
                type="button"
                disabled={!isReachable}
                onClick={() => onStepClick(index)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-white text-gray-400 transition-all duration-300 disabled:cursor-not-allowed dark:bg-gray-900 dark:text-gray-500",
                  isCompleted &&
                    "border-brand-500 bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-theme-xs hover:from-brand-600 hover:to-brand-600",
                  isCurrent &&
                    !isCompleted &&
                    "border-brand-500 text-brand-500 ring-4 ring-brand-500/15 dark:text-brand-400",
                  !isCompleted &&
                    !isCurrent &&
                    "border-gray-200 dark:border-gray-700",
                  isReachable &&
                    !isCompleted &&
                    !isCurrent &&
                    "hover:border-gray-300 hover:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-400",
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
              </button>

              <div className="flex flex-col items-center gap-0.5 px-1 text-center">
                <span
                  className={cn(
                    "text-xs font-semibold transition-colors",
                    isCurrent || isCompleted
                      ? "text-gray-800 dark:text-white/90"
                      : "text-gray-400 dark:text-gray-500",
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
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
