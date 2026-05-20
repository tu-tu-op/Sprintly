import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DashboardGridProps {
  children: ReactNode;
  className?: string;
}

export function DashboardGrid({ children, className }: DashboardGridProps) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
