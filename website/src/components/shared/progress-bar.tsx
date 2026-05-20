import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-container-high", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${boundedValue}%` }} />
    </div>
  );
}
