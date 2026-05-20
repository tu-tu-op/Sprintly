"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { pageTransition, panelTransition } from "@/lib/motion";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container">
      <AppSidebar />
      <AppTopbar />
      <motion.main
        className="mx-auto min-h-screen max-w-container-max px-margin-mobile pb-12 pt-[88px] md:ml-[260px] md:px-margin-desktop"
        variants={pageTransition}
        initial="initial"
        animate="animate"
        transition={panelTransition}
      >
        {children}
      </motion.main>
      <MobileNavDrawer />
      <CommandPalette />
    </div>
  );
}
