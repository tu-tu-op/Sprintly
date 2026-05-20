"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

interface UIState {
  sidebarOpen: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  themeMode: ThemeMode;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileNavOpen: false,
      commandPaletteOpen: false,
      themeMode: "dark",
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "sprintly-ui",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        themeMode: state.themeMode,
      }),
    },
  ),
);
