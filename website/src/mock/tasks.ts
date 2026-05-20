import type { Task } from "@/types";

export const mockTasks: Task[] = [
  {
    id: "task-1",
    title: "Refine task workspace imports",
    description: "Prepare component boundaries for incoming Stitch sections.",
    status: "in_progress",
    priority: "high",
    tags: ["architecture", "ui"],
    estimateMinutes: 90,
    dueDate: "2026-05-24",
    createdAt: "2026-05-19T10:00:00.000Z",
    updatedAt: "2026-05-20T06:45:00.000Z",
  },
  {
    id: "task-2",
    title: "Map analytics chart contracts",
    status: "ready",
    priority: "medium",
    tags: ["analytics"],
    estimateMinutes: 45,
    createdAt: "2026-05-19T11:15:00.000Z",
    updatedAt: "2026-05-19T11:15:00.000Z",
  },
  {
    id: "task-3",
    title: "Review onboarding page export",
    status: "backlog",
    priority: "low",
    tags: ["onboarding"],
    createdAt: "2026-05-18T14:20:00.000Z",
    updatedAt: "2026-05-18T14:20:00.000Z",
  },
];
