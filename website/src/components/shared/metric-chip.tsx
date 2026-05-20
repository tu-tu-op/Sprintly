import { cn } from "@/lib/utils";

interface MetricChipProps {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}

export function MetricChip({ label, value, tone = "neutral" }: MetricChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "border-outline-variant bg-surface-container text-on-surface-variant",
        tone === "success" && "border-success-streak/30 bg-success-streak/10 text-success-streak",
        tone === "warning" && "border-tertiary/30 bg-tertiary/10 text-tertiary",
      )}
    >
      <span>{label}</span>
      <span className="text-on-surface">{value}</span>
    </span>
  );
}
