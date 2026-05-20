import type { ReactNode } from "react";

import { SectionCard } from "@/components/shared/section-card";

interface ChartContainerProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function ChartContainer({ title, description, children }: ChartContainerProps) {
  return (
    <SectionCard title={title} description={description}>
      <div className="min-h-64 w-full">{children}</div>
    </SectionCard>
  );
}
