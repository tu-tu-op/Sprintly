import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-8 text-center">
      {icon ? <div className="mb-4 text-primary">{icon}</div> : null}
      <h2 className="font-display text-lg font-semibold text-on-surface">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-on-surface-variant">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
