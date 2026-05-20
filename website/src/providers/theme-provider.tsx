"use client";

import { useEffect, type ReactNode } from "react";

import { useUIStore } from "@/store";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeMode = useUIStore((state) => state.themeMode);

  useEffect(() => {
    const root = window.document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [themeMode]);

  return children;
}
