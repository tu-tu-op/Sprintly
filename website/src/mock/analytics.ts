import type { AnalyticsChart } from "@/types";

export const analyticsCharts: AnalyticsChart[] = [
  {
    id: "focus-trend",
    title: "Focus trend",
    kind: "line",
    data: [
      { label: "Mon", value: 120 },
      { label: "Tue", value: 160 },
      { label: "Wed", value: 90 },
      { label: "Thu", value: 210 },
      { label: "Fri", value: 180 },
    ],
  },
  {
    id: "throughput",
    title: "Task throughput",
    kind: "bar",
    data: [
      { label: "Backlog", value: 12 },
      { label: "Ready", value: 7 },
      { label: "Active", value: 4 },
      { label: "Done", value: 28 },
    ],
  },
];
