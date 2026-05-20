"use client";

import { create } from "zustand";

import { sessionMetrics } from "@/mock";
import type { FocusSession, SessionMetrics } from "@/types";

interface SessionState {
  activeSession: FocusSession | null;
  streak: number;
  focusTimeMinutes: number;
  metrics: SessionMetrics;
  setActiveSession: (session: FocusSession | null) => void;
  setMetrics: (metrics: SessionMetrics) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  streak: 9,
  focusTimeMinutes: sessionMetrics.focusMinutesToday,
  metrics: sessionMetrics,
  setActiveSession: (activeSession) => set({ activeSession }),
  setMetrics: (metrics) =>
    set({
      metrics,
      focusTimeMinutes: metrics.focusMinutesToday,
    }),
}));
