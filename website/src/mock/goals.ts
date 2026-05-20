import type { Goal } from "@/types";

export const mockGoals: Goal[] = [
  {
    id: "goal-1",
    title: "Ship import-ready app shell",
    description: "Complete the base application architecture.",
    status: "active",
    progress: 68,
    targetDate: "2026-05-25",
  },
  {
    id: "goal-2",
    title: "Integrate dashboard export",
    status: "not_started",
    progress: 0,
    targetDate: "2026-05-28",
  },
];
