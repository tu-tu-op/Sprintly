import { cn } from "@/lib/utils";

interface StatRingProps {
  value: number;
  label?: string;
  className?: string;
}

export function StatRing({ value, label, className }: StatRingProps) {
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn("grid size-24 place-items-center rounded-full", className)}
      style={{
        background: `conic-gradient(var(--ring-color, #d0bcff) ${boundedValue * 3.6}deg, #353534 0deg)`,
      }}
    >
      <div className="grid size-20 place-items-center rounded-full bg-surface">
        <div className="text-center">
          <p className="font-display text-lg font-bold text-on-surface">{boundedValue}%</p>
          {label ? <p className="text-[11px] text-on-surface-variant">{label}</p> : null}
        </div>
      </div>
    </div>
  );
}
