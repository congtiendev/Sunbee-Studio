"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import DangerItem from "@/pages/main/profile/danger/danger-item";
import { defaultDangerActions } from "@/pages/main/profile/danger/data";
import type { DangerZoneProps } from "@/pages/main/profile/danger/types";

export default function DangerZone({
  title = "Danger Zone",
  items = defaultDangerActions,
  className,
  onLogout,
  onDelete,
}: DangerZoneProps) {
  const handleAction = (id: string, customOnClick?: () => void) => {
    if (customOnClick) {
      customOnClick();
      return;
    }
    if (id === "logout-all") {
      onLogout?.();
    } else if (id === "delete-account") {
      onDelete?.();
    }
  };

  return (
    <Card
      className={cn(
        "card-surface p-5 lg:p-6",
        className,
      )}
    >
      <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {title}
      </h4>

      <div className="mt-1">
        {items.map((item, index) => (
          <DangerItem
            key={item.id}
            title={item.title}
            description={item.description}
            buttonText={item.buttonText}
            icon={item.icon}
            variant={item.variant}
            hasDivider={index < items.length - 1}
            onAction={() => handleAction(item.id, item.onClick)}
          />
        ))}
      </div>
    </Card>
  );
}

export { DangerZone };
