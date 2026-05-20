"use client";

import Link from "next/link";

import { APP_NAVIGATION } from "@/constants/navigation";
import { useActiveNavigation } from "@/hooks/use-active-navigation";
import { cn } from "@/lib/utils";

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

export function AppSidebar() {
  const { isActive } = useActiveNavigation();
  const primaryItems = APP_NAVIGATION.filter((item) =>
    ["dashboard", "workspace", "sessions", "analytics", "goals"].includes(item.key),
  );
  const bottomItems = APP_NAVIGATION.filter((item) => ["profile", "settings"].includes(item.key));

  return (
    <nav className="fixed left-0 top-0 z-50 hidden h-screen w-[260px] flex-col space-y-unit border-r border-glass-border bg-surface-container py-margin-desktop shadow-[0_0_15px_rgba(139,92,246,0.1)] backdrop-blur-xl md:flex">
      <div className="mb-8 flex items-center gap-3 px-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-tr from-primary to-secondary p-[1px]">
          <div className="grid h-full w-full place-items-center rounded-lg bg-surface-graphite font-headline-md text-headline-md font-black text-primary">
            S
          </div>
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-black tracking-tight text-primary">Sprintly</h1>
          <p className="font-label-sm-mono text-label-sm-mono uppercase tracking-widest text-on-surface-variant">
            Developer Craft
          </p>
        </div>
      </div>

      <div className="mb-6 px-6">
        <button className="neon-glow flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-accent to-primary px-4 py-3 font-label-md text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            add
          </span>
          New Session
        </button>
      </div>

      <div className="flex-1 space-y-2 px-4">
        {primaryItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-bright/50 hover:text-on-surface",
                active && "scale-95 border-r-2 border-primary bg-primary-container/10 text-primary",
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
      </div>

      <div className="mt-auto space-y-2 px-4">
        {bottomItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-bright/50 hover:text-on-surface",
                active && "scale-95 border-r-2 border-primary bg-primary-container/10 text-primary",
              )}
            >
              <span
                className="material-symbols-outlined"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {materialIcons[item.key]}
              </span>
              <span className="font-label-md text-label-md">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
