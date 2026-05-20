"use client";

import Link from "next/link";
import { Command, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_NAVIGATION } from "@/constants/navigation";
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut";
import { useUIStore } from "@/store";

export function CommandPalette() {
  const open = useUIStore((state) => state.commandPaletteOpen);
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);

  useCommandPaletteShortcut();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/60 px-4 pt-[12vh]">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low shadow-panel">
        <div className="flex h-14 items-center gap-3 border-b border-outline-variant px-4">
          <Command className="size-5 text-primary" />
          <span className="flex-1 text-sm text-on-surface-variant">Command palette shell</span>
          <Button variant="ghost" size="icon" aria-label="Close command palette" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="p-2">
          {APP_NAVIGATION.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
              >
                <Icon className="size-4 text-on-surface-variant" />
                <span className="font-medium">{item.label}</span>
                <span className="ml-auto text-xs text-on-surface-variant">{item.href}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
