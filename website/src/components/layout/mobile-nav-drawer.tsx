"use client";

import Link from "next/link";

import { APP_NAVIGATION } from "@/constants/navigation";
import { useActiveNavigation } from "@/hooks/use-active-navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

const materialIcons: Record<string, string> = {
  dashboard: "dashboard",
  workspace: "terminal",
  sessions: "timer",
  analytics: "insights",
  goals: "military_tech",
  profile: "account_circle",
  settings: "settings",
  billing: "credit_card",
  community: "groups",
};

function navLabel(label: string) {
  return label === "Dashboard" ? "Overview" : label;
}

export function MobileNavDrawer() {
  const mobileNavOpen = useUIStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen);
  const { isActive } = useActiveNavigation();

  if (!mobileNavOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        className="absolute inset-0 bg-black/60"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className="relative flex h-full w-80 max-w-[86vw] flex-col border-r border-glass-border bg-surface-container py-margin-mobile shadow-panel">
        <div className="mb-6 flex items-center justify-between px-6">
          <div>
            <h1 className="font-headline-md text-headline-md font-black text-primary">Sprintly</h1>
            <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
              Developer Craft
            </p>
          </div>
          <button className="text-on-surface-variant" type="button" onClick={() => setMobileNavOpen(false)}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav className="shell-scrollbar flex-1 overflow-y-auto px-4">
          {APP_NAVIGATION.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "mb-2 flex items-center gap-3 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-bright/50 hover:text-on-surface",
                  active && "border-r-2 border-primary bg-primary-container/10 text-primary",
                )}
              >
                <span
                  className="material-symbols-outlined"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {materialIcons[item.key]}
                </span>
                <span className="font-label-md text-label-md">{navLabel(item.label)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
