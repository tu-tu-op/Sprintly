"use client";

import { cn } from "@/lib/utils";

export interface TabItem<TValue extends string = string> {
  label: string;
  value: TValue;
}

interface TabsProps<TValue extends string = string> {
  items: TabItem<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
}

export function Tabs<TValue extends string = string>({ items, value, onValueChange }: TabsProps<TValue>) {
  return (
    <div className="inline-flex rounded-md border border-outline-variant bg-surface-container p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onValueChange(item.value)}
          className={cn(
            "h-8 rounded-sm px-3 text-sm font-medium text-on-surface-variant transition-colors",
            value === item.value && "bg-surface-container-high text-on-surface",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
