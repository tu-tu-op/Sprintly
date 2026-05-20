"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

import { useUIStore } from "@/store";

function pageTitle(pathname: string) {
  if (pathname === "/dashboard") {
    return "Overview";
  }

  const segment = pathname.split("/").filter(Boolean).at(0);
  if (!segment) {
    return "Overview";
  }

  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function AppTopbar() {
  const pathname = usePathname();
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen);
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const title = pageTitle(pathname);
  const isWorkspace = pathname.startsWith("/workspace");
  const isAnalytics = pathname.startsWith("/analytics");

  if (isWorkspace || isAnalytics) {
    const searchPlaceholder = isAnalytics ? "Search analytics..." : "Search tasks, projects, commands...";
    const mobileTitle = isAnalytics ? "Analytics" : "Workspace";
    const avatarSrc = isAnalytics
      ? "https://lh3.googleusercontent.com/aida-public/AB6AXuAz2iPiy9sDNfMw2DRQ-5iJ_pR-ARKVUX93Ekj7QiOmZ_E2L6XWMpiyZENsJ7Kkv7PaEUYZNTBi6QBNXSSJlrXfP7ltjrUfMK7VDgOdVP9orS1URXI0oN7Rpal3AF1Bgx4Lzi1qLkxgPcrO1xK14VwHIyE4KMkbZGhO6BK-XjVHotMrbK96dFcSVmVWm33Er-sOPWbDkLVCd1Kk5gxqjQ336e2DYGpRcyzN4kEzcYV-o7MrHt72eOSMGXeOn52SPtv0a6-uDzyZhEE"
      : "https://lh3.googleusercontent.com/aida-public/AB6AXuA-sWYpVvaqkzWbWOBavgdTtfDvtLh4MH3RAfn65_ogLEwKj_DlmOOcl5MCkfVju981h-VOeySFX8AcPM7yCpxdWp4J-Ny2WBGSoifWVLvsaGSCY4GjLi_2fbi55yIQAVRoYWkgPCAC9zH37cDibO5pp_tyoN_9BmUz0LGvpi9fbWBRN30__7kADV75-PKbiY_VWAFsteBmc4wTizLoMHwvH4PE1BGytGZwCREz6YxrQAL_1p_gt7VRRrtYQYa3I2eHrnJpkVGBehs";

    return (
      <header className="fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-glass-border bg-surface/80 px-margin-mobile backdrop-blur-md md:left-[260px] md:px-margin-desktop">
        <div className="flex w-full max-w-xl items-center gap-3">
          <button
            className="text-on-surface-variant transition-colors hover:text-on-surface md:hidden"
            aria-label="Open navigation"
            type="button"
            onClick={() => setMobileNavOpen(true)}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <button className="group relative hidden w-full md:block" type="button" onClick={() => setCommandPaletteOpen(true)}>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-primary">
              search
            </span>
            <span className="block w-full rounded-xl border border-glass-border bg-[#0A0A0A] py-2 pl-10 pr-20 text-left font-body-sm text-body-sm text-on-surface-variant/50 transition-all group-hover:border-primary/50 group-hover:ring-1 group-hover:ring-primary/50">
              {searchPlaceholder}
            </span>
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-1">
              <kbd className="hidden rounded bg-surface-variant px-1.5 py-0.5 font-label-sm-mono text-[10px] text-on-surface-variant md:inline-block">
                Cmd
              </kbd>
              <kbd className="hidden rounded bg-surface-variant px-1.5 py-0.5 font-label-sm-mono text-[10px] text-on-surface-variant md:inline-block">
                K
              </kbd>
            </span>
          </button>
          <span className="font-headline-md text-headline-md font-bold text-primary md:hidden">{mobileTitle}</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high/50 hover:text-on-surface">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_rgba(208,188,255,0.8)]" />
          </button>
          <div className="h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-glass-border bg-surface-container-high transition-all hover:ring-1 hover:ring-primary/50">
            <Image
              alt="User Avatar"
              className="h-full w-full object-cover"
              height={32}
              src={avatarSrc}
              width={32}
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-glass-border bg-surface/80 px-margin-mobile backdrop-blur-md md:left-[260px] md:px-margin-desktop">
      <div className="flex items-center gap-2">
        <button
          className="mr-2 text-on-surface-variant transition-colors hover:text-on-surface md:hidden"
          aria-label="Open navigation"
          type="button"
          onClick={() => setMobileNavOpen(true)}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="hidden font-headline-md text-headline-md font-bold text-primary md:block">{title}</span>
        <span className="font-headline-md text-headline-md font-bold text-primary md:hidden">Sprintly</span>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <button
          className="hidden items-center gap-2 rounded-xl border border-glass-border bg-surface-graphite px-4 py-2 text-on-surface-variant transition-colors hover:border-primary/50 focus:ring-1 focus:ring-primary/50 md:flex"
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <span className="material-symbols-outlined text-[18px]">search</span>
          <span className="mr-8 font-body-sm text-body-sm">Search commands...</span>
          <div className="flex items-center gap-1">
            <span className="rounded bg-surface-variant px-1.5 py-0.5 font-label-sm-mono text-[10px]">Cmd</span>
            <span className="rounded bg-surface-variant px-1.5 py-0.5 font-label-sm-mono text-[10px]">K</span>
          </div>
        </button>

        <button className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high/50 hover:text-primary">
          <span className="material-symbols-outlined">notifications</span>
          <span className="neon-glow absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
        </button>
        <button
          className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high/50 hover:text-primary"
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <span className="material-symbols-outlined">keyboard_command_key</span>
        </button>
        <button className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-secondary p-[1px]" aria-label="Profile">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-graphite font-label-md text-label-md text-primary">
            D
          </div>
        </button>
      </div>
    </header>
  );
}
