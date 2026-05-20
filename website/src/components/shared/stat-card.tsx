import type { ReactNode } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "flat";
}

export function StatCard({ label, value, delta, icon, trend = "flat" }: StatCardProps) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-on-surface-variant">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-on-surface">{value}</p>
          {delta ? (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                trend === "up" && "text-success-streak",
                trend === "down" && "text-error",
                trend === "flat" && "text-on-surface-variant",
              )}
            >
              {delta}
            </p>
          ) : null}
        </div>
        {icon ? <div className="rounded-md bg-surface-container-high p-2 text-primary">{icon}</div> : null}
      </div>
    </SectionCard>
  );
}
