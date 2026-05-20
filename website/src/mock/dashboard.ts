import type { DashboardStat, DashboardWidget } from "@/types";

export const dashboardStats: DashboardStat[] = [
  { id: "focus", label: "Focus time", value: "18.4h", delta: "+12%", trend: "up" },
  { id: "tasks", label: "Tasks shipped", value: "42", delta: "+8", trend: "up" },
  { id: "streak", label: "Current streak", value: "9 days", delta: "flat", trend: "flat" },
  { id: "score", label: "Sprint score", value: "87", delta: "+5", trend: "up" },
];

export const dashboardWidgets: DashboardWidget[] = [
  { id: "today", title: "Today", kind: "stat" },
  { id: "throughput", title: "Throughput", kind: "chart" },
  { id: "sessions", title: "Session timeline", kind: "list" },
];
