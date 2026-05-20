"use client";

import { useEffect } from "react";

import { useUIStore } from "@/store";

export function useCommandPaletteShortcut() {
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen]);
}
